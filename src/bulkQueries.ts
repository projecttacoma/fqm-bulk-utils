import fs from 'fs/promises';
import * as path from 'path';
import { Calculator, DRCalculationOutput } from 'fqm-execution';

/**
 * Loads file from cli input to calculate bulkQueries from the file
 */
export async function cliBulkQueries(filePath: string) {
  // Read in bundle
  let data: string;
  try {
    data = await fs.readFile(path.resolve(filePath), 'utf8');
  } catch (err) {
    console.error('Error reading the bundle: ', err);
    return;
  }

  const bundle = JSON.parse(data) as fhir4.Bundle;
  const queries = await bulkQueries(bundle);
  console.log(JSON.stringify(queries));
}

/**
 * Generates a
 */
export async function bulkQueries(bundle: fhir4.Bundle) {
  // simple approach...
  // If there's a codeFilter with a direct code, create a typeFilter for that code
  // If the codeFilter doesn't have a code (valueset or some other specification), create a generic _type query instead
  // This _type query should supercede all other potential narrowing that's found on that resource
  // If we can narrow:
  // Within the same DR codeFilter list, typeFilters should be ANDed (i.e. _typeFilter=A,B)
  // Across different DR's, typeFilters should be ORd (i.e.  _typeFilter=A&_typeFilter=B)
  // Make sure to also include a _type query for all resource types needed

  const dataRequirements: DRCalculationOutput = await Calculator.calculateDataRequirements(bundle);

  // // Test
  // const dataRequirements = {results: {
  //   dataRequirement:
  //   [{
  //     type: "Observation",
  //     codeFilter: [
  //         {
  //             path: "code",
  //             code: [
  //                 {
  //                     system: "http://loinc.org",
  //                     display: "Hospice care [Minimum Data Set]",
  //                     code: "45755-6"
  //                 }
  //             ]
  //         }
  //     ]
  // }
  // ]}}; // -> _typeFilter=Observation%3Fcode%3D45755-6&_type=Observation

  // create record resourcetype => [] of valid typeFilter query strings that will be &-ed as ORs
  const typeFilters: Record<string, string[] | undefined> = {};
  dataRequirements.results.dataRequirement?.forEach(dr => {
    //empty array is general _type query that overrides a more specific _typeFilter
    if (typeFilters[dr.type]?.length === 0) return;

    //any codeFilter that's non-coded or no-path or any contained codings have no code -> results in a general _type query
    if (dr.codeFilter?.find(cf => !cf.code || !cf.path || cf.code.find(coding => !coding.code))) {
      typeFilters[dr.type] = [];
      return;
    }
    //all codefilters have a path and proper code and can be added to our typefilter array
    const fhirQueries = dr.codeFilter?.map(cf => `${cf.path}=${cf.code?.map(coding => coding.code).join(',')}`); // potential multiple codes are comma-separated to be OR'd for this path
    const tfStr = `${dr.type}?${fhirQueries?.join('&')}`; //Example value: 'Procedure?code=1,2&category=3,4'
    if (typeFilters[dr.type]) {
      typeFilters[dr.type]?.push(tfStr);
    } else {
      typeFilters[dr.type] = [tfStr];
    }
  });

  //collate the types and typeFilters into the full url-encoded string that will come after our "$export?"
  // QUESTION: This encodes the comma separating the code values (I assume that is correct, but we don't seem to support it in our server)
  const typeQuery = `_type=${Object.keys(typeFilters).join(',')}`; // Example value: _type=Procedure,Encounter
  const typeFilterQueries = Object.keys(typeFilters)
    .map(resourceType => {
      // array of all typefilters for this resource type
      const bulkQueryArr = typeFilters[resourceType]?.map(tf => `_typeFilter=${encodeURIComponent(tf)}`);
      // join to create params for a single resource
      // Example value: _typeFilter=Procedure%3Fcode%3D1%2C2%26category%3D3%2C4)&_typeFilter=Procedure%3Fcode%3D5
      return bulkQueryArr?.join('&') ?? '';
    })
    .filter(query => query !== '');
  return typeFilterQueries.concat(typeQuery).join('&'); // join all non-empty resources with the type query
}
