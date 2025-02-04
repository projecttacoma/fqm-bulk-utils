#! node
import { Command } from 'commander';
import { cliDataRequirements } from './dataRequirements';
import { cliBulkQueries } from './bulkQueries';

const program = new Command();
program.name('fqm-bulk-utils').description('FQM Bulk Utils');

program
  .command('data-requirements')
  .argument('<measureBundle>', 'FHIR Measure Bundle path')
  .description('outputs data requirements for the passed measure bundle')
  .action(cliDataRequirements);

program
  .command('bulk-queries')
  .argument('<measureBundle>', 'FHIR Measure Bundle path')
  .description("outputs bulk queries based on the passed measure's data requirements")
  .action(cliBulkQueries);

program.parse();
