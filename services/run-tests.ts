#!/usr/bin/env bun
// Programmatic test runner for all microservices

import { $ } from "bun";

const SERVICES = [
  "auth",
  "users",
  "products",
  "orders",
  "payments",
  "notifications",
  "analytics",
  "search",
  "integration",
];

interface ServiceResult {
  name: string;
  passed: number;
  failed: number;
  duration: string;
  success: boolean;
  output: string;
}

const results: ServiceResult[] = [];
const baseDir = import.meta.dir;

console.log("==========================================");
console.log("  Microservice Test Suite");
console.log("==========================================\n");

for (const service of SERVICES) {
  const serviceDir = `${baseDir}/${service}`;
  console.log(`--- Testing: ${service} ---`);

  try {
    const result =
      await $`cd ${serviceDir} && bun test 2>&1`.text();
    const passMatch = result.match(/(\d+) pass/);
    const failMatch = result.match(/(\d+) fail/);
    const timeMatch = result.match(/Ran .+ in ([\d.]+(?:ms|s))/);

    const passed = passMatch ? parseInt(passMatch[1]) : 0;
    const failed = failMatch ? parseInt(failMatch[1]) : 0;
    const duration = timeMatch ? timeMatch[1] : "?";

    results.push({
      name: service,
      passed,
      failed,
      duration,
      success: failed === 0,
      output: result,
    });

    console.log(`  ${passed} pass, ${failed} fail (${duration})`);
  } catch (e: any) {
    const output = e?.stdout?.toString() || e?.message || "Unknown error";
    const passMatch = output.match(/(\d+) pass/);
    const failMatch = output.match(/(\d+) fail/);

    results.push({
      name: service,
      passed: passMatch ? parseInt(passMatch[1]) : 0,
      failed: failMatch ? parseInt(failMatch[1]) : 1,
      duration: "?",
      success: false,
      output,
    });

    console.log(`  FAILED: ${output.split("\n").slice(-5).join("\n")}`);
  }
  console.log();
}

// Summary
const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
const totalExpects = results.reduce((sum, r) => sum + r.passed + r.failed, 0);
const failedServices = results.filter((r) => !r.success);

console.log("==========================================");
console.log("  RESULTS");
console.log("==========================================");
console.log(`  Total tests: ${totalPassed + totalFailed}`);
console.log(`  Passed: ${totalPassed}`);
console.log(`  Failed: ${totalFailed}`);
console.log(`  Services: ${results.length}`);

if (failedServices.length > 0) {
  console.log(`  Failed: ${failedServices.map((r) => r.name).join(", ")}`);
  process.exit(1);
} else {
  console.log("  All services passed!");
  process.exit(0);
}
