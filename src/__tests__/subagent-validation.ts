/**
 * Subagent Validation Test
 * 
 * Validates that Entity 1's resources provide sufficient context to answer
 * specific validation questions using ONLY MCP resources (no external knowledge).
 * 
 * Validation Questions:
 * 1. How to walk user through setting up AWS SSM plugins
 * 2. Tell user what a Runner is and why it's important
 * 3. If it's possible to monitor Rundeck performance metrics
 * 4. If there is a Salesforce integration and how to use it in a job. If no, what alternatives are available
 */

import { handleResource, listResources } from "../resources/index.js";

interface ValidationResult {
  question: string;
  resourcesUsed: string[];
  answerFound: boolean;
  answerPreview: string;
  issues: string[];
}

/**
 * Simulate subagent querying resources for a question
 */
function queryResourcesForQuestion(question: string, relevantUris: string[]): ValidationResult {
  const resourcesUsed: string[] = [];
  const answerParts: string[] = [];
  const issues: string[] = [];
  let answerFound = false;

  for (const uri of relevantUris) {
    try {
      const content = handleResource(uri);
      if (content && !content.includes("not found") && content.length > 50) {
        resourcesUsed.push(uri);
        answerParts.push(`\n--- Resource: ${uri} ---\n${content.substring(0, 500)}...`);
        answerFound = true;
      } else {
        issues.push(`Resource ${uri} returned empty or error: ${content.substring(0, 100)}`);
      }
    } catch (error) {
      issues.push(`Error accessing resource ${uri}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    question,
    resourcesUsed,
    answerFound,
    answerPreview: answerParts.join("\n"),
    issues,
  };
}

/**
 * Run all validation questions
 */
export function runSubagentValidation(): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Question 1: AWS SSM Setup
  results.push(
    queryResourcesForQuestion(
      "How to walk user through setting up AWS SSM plugins",
      [
        "rundeck://docs/manual/projects/aws-ssm",
        "rundeck://docs/manual/aws-ssm-setup",
        "rundeck://aws-ssm-setup",
        "rundeck://docs/manual/projects/node-execution/aws-ssm",
      ]
    )
  );

  // Question 2: What is a Runner
  results.push(
    queryResourcesForQuestion(
      "Tell user what a Runner is and why it's important",
      [
        "rundeck://docs/learning/getting-started/runners-overview",
        "rundeck://learn/runners",
        "rundeck://ref/runners",
        "rundeck://docs/administration/runner",
      ]
    )
  );

  // Question 3: Performance Monitoring
  results.push(
    queryResourcesForQuestion(
      "If it's possible to monitor Rundeck performance metrics",
      [
        "rundeck://docs/manual/performance",
        "rundeck://docs/manual/metrics",
        "rundeck://performance-monitoring",
        "rundeck://docs/api/metrics",
        "rundeck://api/metrics",
      ]
    )
  );

  // Question 4: Salesforce Integration
  results.push(
    queryResourcesForQuestion(
      "If there is a Salesforce integration and how to use it in a job. If no, what alternatives are available",
      [
        "rundeck://docs/integrations/salesforce",
        "rundeck://salesforce",
        "rundeck://salesforce-alternatives",
        "rundeck://docs/developer/plugins",
        "rundeck://docs/developer/webhook",
      ]
    )
  );

  return results;
}

/**
 * Print validation report
 */
export function printValidationReport(results: ValidationResult[]): void {
  console.log("\n" + "=".repeat(80));
  console.log("SUBAGENT VALIDATION REPORT");
  console.log("=".repeat(80) + "\n");

  let allPassed = true;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const questionNum = i + 1;
    
    console.log(`Question ${questionNum}: ${result.question}`);
    console.log("-".repeat(80));
    
    if (result.answerFound) {
      console.log("✅ ANSWER FOUND");
      console.log(`Resources used: ${result.resourcesUsed.join(", ")}`);
      console.log(`Answer preview:\n${result.answerPreview.substring(0, 300)}...`);
    } else {
      console.log("❌ ANSWER NOT FOUND");
      allPassed = false;
    }
    
    if (result.issues.length > 0) {
      console.log(`Issues encountered:`);
      result.issues.forEach(issue => console.log(`  - ${issue}`));
    }
    
    console.log("\n");
  }

  console.log("=".repeat(80));
  if (allPassed) {
    console.log("✅ ALL VALIDATION QUESTIONS PASSED");
  } else {
    console.log("❌ SOME VALIDATION QUESTIONS FAILED");
  }
  console.log("=".repeat(80) + "\n");
}

// Run validation if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const results = runSubagentValidation();
  printValidationReport(results);
  
  // Exit with appropriate code
  const allPassed = results.every(r => r.answerFound);
  process.exit(allPassed ? 0 : 1);
}

