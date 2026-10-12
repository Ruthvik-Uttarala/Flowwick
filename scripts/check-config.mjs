#!/usr/bin/env node

import {
  formatConfigReport,
  validateProductionConfig,
} from "../src/lib/server/production-config.mjs";

export function runConfigCheck(environment = process.env, args = process.argv.slice(2)) {
  const modeArgument = args.find((argument) => argument.startsWith("--mode="));
  const mode = modeArgument?.slice("--mode=".length) || "production";
  const result = validateProductionConfig(environment, { mode });
  const report = formatConfigReport(result);

  if (result.valid) {
    console.log(report);
    return 0;
  }

  console.error(report);
  return 1;
}

const isDirectExecution =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href;

if (isDirectExecution) {
  try {
    process.exitCode = runConfigCheck();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown validation error.";
    console.error(`Configuration check failed: ${message}`);
    process.exitCode = 1;
  }
}
