/**
 * Loads file from cli input to use dataRequirements passthrough on it
 */
export declare function cliDataRequirements(filePath: string): Promise<void>;
/**
 * Pass through of fqm-execution dataRequirements
 */
export declare function dataRequirements(bundle: fhir4.Bundle): Promise<import("fqm-execution").DRCalculationOutput>;
