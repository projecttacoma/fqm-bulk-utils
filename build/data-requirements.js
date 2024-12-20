"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cliDataRequirements = cliDataRequirements;
exports.dataRequirements = dataRequirements;
const promises_1 = __importDefault(require("fs/promises"));
const path = __importStar(require("path"));
const fqm_execution_1 = require("fqm-execution");
/**
 * Loads file from cli input to use dataRequirements passthrough on it
 */
async function cliDataRequirements(filePath) {
    // Read in bundle
    let data;
    try {
        data = await promises_1.default.readFile(path.resolve(filePath), 'utf8');
    }
    catch (err) {
        console.error('Error reading the bundle: ', err);
        return;
    }
    const bundle = JSON.parse(data);
    const dr = await dataRequirements(bundle);
    console.log(JSON.stringify(dr.results));
}
/**
 * Pass through of fqm-execution dataRequirements
 */
async function dataRequirements(bundle) {
    return await fqm_execution_1.Calculator.calculateDataRequirements(bundle);
}
//# sourceMappingURL=data-requirements.js.map