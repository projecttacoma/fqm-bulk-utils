#! node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const data_requirements_1 = require("./data-requirements");
const program = new commander_1.Command();
program.name('fqm-bulk-utils').description('FQM Bulk Utils');
program
    .command('data-requirements')
    .argument('<measureBundle>', 'FHIR Measure Bundle path')
    .description('outputs data requirements for the passed measure bundle')
    .action(data_requirements_1.cliDataRequirements);
program.parse();
//# sourceMappingURL=cli.js.map