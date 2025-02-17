import fs from 'fs/promises';
import * as path from 'path';
import { Calculator } from 'fqm-execution';
import {
  AndFilter,
  AnyFilter,
  DuringFilter,
  EqualsFilter,
  InFilter,
  IsNullFilter,
  NotNullFilter,
  ValueFilter
} from 'fqm-execution/build/types/QueryFilterTypes';
import { ExpressionSearchMap } from 'fhir-spec-tools/build/data/expressionSearchParameters';

/**
 * Loads file from cli input to calculate group from the file
 */
export async function cliGroup(filePath: string) {
  // Read in bundle
  let data: string;
  try {
    data = await fs.readFile(path.resolve(filePath), 'utf8');
  } catch (err) {
    console.error('Error reading the bundle: ', err);
    return;
  }

  const bundle = JSON.parse(data) as fhir4.Bundle;
  const queries = await group(bundle);
  console.log(JSON.stringify(queries));
}

/**
 * Generates a conditional group for the passed bundle, based on the IPP
 * NOTE: this approach does not work for negation (i.e. without), which may not be expressible for condition groups
 */
export async function group(bundle: fhir4.Bundle): Promise<fhir4.Group> {
  // use measure to define IPP
  // NOTE: Only uses the first measure group for now!
  const measure = bundle.entry?.find(e => e.resource?.resourceType === 'Measure')?.resource as
    | fhir4.Measure
    | undefined;

  if (!measure?.group?.length || measure.group.length < 1) {
    throw Error('measure does not define any groups');
  }
  const ipp = measure.group[0].population?.find(p => p.code?.coding?.some(c => c.code === 'initial-population'));
  const expression = ipp?.criteria.expression;
  if (!expression) {
    throw Error('measure does not define an IPP expression');
  }

  const output = await Calculator.calculateQueryInfo(bundle, { focusedStatement: expression });
  // example expression: 'Condition?category=http://terminology.hl7.org/CodeSystem/condition-category|problem-list-item&clinical-status=http://terminology.hl7.org/CodeSystem/condition-clinical|active&code=http://hl7.org/fhir/sid/icd-10-cm|E11.9'
  // from https://build.fhir.org/ig/HL7/bulk-data/branches/argo24/Group-BulkCohortGroupExample.json.html

  // new expression for each retrieve
  const expressionArr = output.results.map(dtq => {
    const queryList: string[] = [];
    if (dtq.path) {
      if (dtq.valueSet) {
        queryList.push(`${dtq.path}:in=${dtq.valueSet}`);
      }
      // does not handle both valueSet and code at the same time if they can coexist
      else if (dtq.code) {
        queryList.push(`${dtq.path}=${dtq.code.system}|${dtq.code.code}`);
      }
    }
    if (dtq.queryInfo?.filter) {
      queryList.push(...queriesForFilter(dtq.queryInfo.filter, dtq.dataType));
    }
    const baseQuery = `${dtq.dataType}`;
    if (queryList.length === 0) {
      return baseQuery;
    }
    return `${baseQuery}?${queryList.join('&')}`;
  });

  // format as modifier extensions
  const modifierArr: fhir4.Extension[] = expressionArr.map(exp => {
    return {
      url: 'http://hl7.org/fhir/uv/bulkdata/StructureDefinition/member-filter',
      valueExpression: {
        language: 'application/x-fhir-query',
        expression: exp
      }
    };
  });

  //format as group
  const group: fhir4.Group = {
    resourceType: 'Group',
    actual: false,
    name: `IPP-${measure.name}`,
    type: 'person',
    modifierExtension: modifierArr
  };

  return group;
}

// Generates an array of fhir query strings that correspond with the passed filter and all children
function queriesForFilter(filter: AnyFilter, dataType: string): string[] {
  let typedFilter;
  let param;
  switch (filter.type) {
    case 'and':
      return (filter as AndFilter).children.flatMap(c => queriesForFilter(c, dataType));
    case 'in':
      typedFilter = filter as InFilter;
      param = ExpressionSearchMap[`${dataType}.${typedFilter.attribute}`];
      if (!param) return []; //not a searchable expression
      if (typedFilter.valueCodingList) {
        // technically the code could be undefined, but eh
        return [`${param}=${typedFilter.valueCodingList.map(c => c.code).join(',')}`];
      }
      if (typedFilter.valueList) {
        return [`${param}=${typedFilter.valueList.join(',')}`];
      }
      return [];
    case 'during':
      // CQL spec indicates synonymous with IncludedIn: if the first operand is completely included in the second
      // assume exclusive for dates?
      typedFilter = filter as DuringFilter;
      param = ExpressionSearchMap[`${dataType}.${typedFilter.attribute}`];
      if (!param) return []; //not a searchable expression
      // eslint-disable-next-line no-case-declarations
      const durationQueries = [];
      if (typedFilter.valuePeriod.start) {
        durationQueries.push(`${param}=gt${typedFilter.valuePeriod.start}`);
      }
      if (typedFilter.valuePeriod.end) {
        durationQueries.push(`${param}=lt${typedFilter.valuePeriod.end}`);
      }
      return durationQueries;
    case 'isnull':
      typedFilter = filter as IsNullFilter;
      param = ExpressionSearchMap[`${dataType}.${typedFilter.attribute}`];
      if (!param) return []; //not a searchable expression
      return [`${param}:missing=true`];
    case 'notnull':
      typedFilter = filter as NotNullFilter;
      param = ExpressionSearchMap[`${dataType}.${typedFilter.attribute}`];
      if (!param) return []; //not a searchable expression
      return [`${param}:missing=false`];
    case 'equals':
      typedFilter = filter as EqualsFilter;
      param = ExpressionSearchMap[`${dataType}.${typedFilter.attribute}`];
      if (!param) return []; //not a searchable expression
      return [`${param}=${typedFilter.value}`];
    case 'value':
      return valueQueries(filter as ValueFilter, dataType);
    default:
      //or, truth, unknown, whatever other type
      console.warn(`Ignoring "${filter.type}" filter`);
      return [];
  }
}

// Generates an array of fhir query strings for a passed valueFilter
function valueQueries(filter: ValueFilter, dataType: string): string[] {
  const param = ExpressionSearchMap[`${dataType}.${filter.attribute}`];
  if (!param) return []; //not a searchable expression

  // Search prefixes are available for numbers, dates, and quantities https://hl7.org/fhir/R4/search.html#prefix
  // For boolean and string, only allow equal
  if (filter.valueBoolean !== undefined) {
    if (filter.comparator === 'eq') {
      return [`${param}=${filter.valueBoolean}`];
    }
    return [];
  }
  if (filter.valueString !== undefined) {
    if (filter.comparator === 'eq') {
      return [`${param}=${filter.valueString}`];
    }
    return [];
  }
  // sa (starts-after) and eb (ends-before) are not used with integer values
  if (filter.valueInteger !== undefined) {
    if (filter.comparator === 'sa' || filter.comparator === 'eb') {
      return [];
    } else {
      return [`${param}=${filter.comparator}${filter.valueString}`];
    }
  }
  // quantity [parameter]=[prefix][number]|[system]|[code]
  if (filter.valueQuantity !== undefined && filter.valueQuantity.value !== undefined) {
    const systemStr = filter.valueQuantity.system !== undefined ? `|${filter.valueQuantity.system}` : '';
    const codeStr = filter.valueQuantity.code !== undefined ? `|${filter.valueQuantity.code}` : '';
    return [`${param}=${filter.comparator}${filter.valueQuantity.value}${systemStr}${codeStr}`];
  }

  // translate to a quantity to create a query
  if (filter.valueRatio?.numerator?.value !== undefined && filter.valueRatio.denominator?.value !== undefined) {
    // make sure numerator and denominator are comparable
    const numeratorSystemStr =
      filter.valueRatio.numerator.system !== undefined ? `|${filter.valueRatio.numerator.system}` : '';
    const denominatorSystemStr =
      filter.valueRatio.denominator.system !== undefined ? `|${filter.valueRatio.denominator.system}` : '';
    const numeratorCodeStr =
      filter.valueRatio.numerator.code !== undefined ? `|${filter.valueRatio.numerator.code}` : '';
    const denominatorCodeStr =
      filter.valueRatio.denominator.code !== undefined ? `|${filter.valueRatio.denominator.code}` : '';
    if (numeratorSystemStr === denominatorSystemStr && numeratorCodeStr === denominatorCodeStr) {
      const ratioNumber = filter.valueRatio.numerator.value / filter.valueRatio.denominator.value;
      return [`${param}=${filter.comparator}${ratioNumber}${numeratorSystemStr}${numeratorCodeStr}`];
    }
    return [];
  }

  // How should one express an explicit range in the query?
  // Lacking that, use table at https://hl7.org/fhir/R4/search.html#prefix
  // target is the thing you're looking for while searching
  // and search value is the value passed to the query parameter
  if (filter.valueRange !== undefined) {
    const rangeQueries = [];
    if (filter.comparator === 'eq') {
      // the range of the search value fully contains the range of the target value
      // assume inclusive for quantities?
      if (filter.valueRange.low !== undefined) {
        const systemStr = filter.valueRange.low.system !== undefined ? `|${filter.valueRange.low.system}` : '';
        const codeStr = filter.valueRange.low.code !== undefined ? `|${filter.valueRange.low.code}` : '';
        rangeQueries.push(`${param}=ge${filter.valueRange.low}${systemStr}${codeStr}`);
      }
      if (filter.valueRange.high !== undefined) {
        const systemStr = filter.valueRange.high.system !== undefined ? `|${filter.valueRange.high.system}` : '';
        const codeStr = filter.valueRange.high.code !== undefined ? `|${filter.valueRange.high.code}` : '';
        rangeQueries.push(`${param}=le${filter.valueRange.high}${systemStr}${codeStr}`);
      }
    } else if (filter.comparator === 'gt') {
      // the range above the search value intersects (i.e. overlaps) with the range of the target value
      // TODO: figure out how to do the rest of these... what does "the range above the search value" mean when the search value is a range (above the low or above the high?)
    } else if (filter.comparator === 'lt') {
      // the range below the search value intersects (i.e. overlaps) with the range of the target value
    } else if (filter.comparator === 'ge') {
      // the range above the search value intersects (i.e. overlaps) with the range of the target value, or the range of the search value fully contains the range of the target value
    } else if (filter.comparator === 'le') {
      // the range below the search value intersects (i.e. overlaps) with the range of the target value or the range of the search value fully contains the range of the target value
    } else if (filter.comparator === 'sa') {
      // the range of the search value does not overlap with the range of the target value, and the range above the search value contains the range of the target value
    } else if (filter.comparator === 'eb') {
      // the range of the search value does overlap not with the range of the target value, and the range below the search value contains the range of the target value
    }
    return rangeQueries;
  }

  return [];
}
