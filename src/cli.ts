#! node
import { Command } from 'commander';
import { cliDataRequirements } from './dataRequirements';

const program = new Command();
program.name('fqm-bulk-utils').description('FQM Bulk Utils');

program
  .command('data-requirements')
  .argument('<measureBundle>', 'FHIR Measure Bundle path')
  .description('outputs data requirements for the passed measure bundle')
  .action(cliDataRequirements);

program.parse();
