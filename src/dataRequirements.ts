import fs from 'fs/promises';
import * as path from 'path';
import { Calculator } from 'fqm-execution';

/**
 * Loads file from cli input to use dataRequirements passthrough on it
 */
export async function cliDataRequirements(filePath: string) {
  // Read in bundle
  let data: string;
  try {
    data = await fs.readFile(path.resolve(filePath), 'utf8');
  } catch (err) {
    console.error('Error reading the bundle: ', err);
    return;
  }

  const bundle = JSON.parse(data) as fhir4.Bundle;
  const dr = await dataRequirements(bundle);
  console.log(JSON.stringify(dr.results));
}

/**
 * Pass through of fqm-execution dataRequirements
 */
export async function dataRequirements(bundle: fhir4.Bundle) {
  return await Calculator.calculateDataRequirements(bundle);
}
