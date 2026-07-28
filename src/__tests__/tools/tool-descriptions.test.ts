import {
  API_CALL_DESCRIPTION,
  RUNNER_CREATE_DESCRIPTION,
  ACL_MANAGE_DESCRIPTION,
  JOB_CREATE_DESCRIPTION,
  JOB_VALIDATE_DESCRIPTION,
} from "../../tools/tool-descriptions.js";

describe("specialized tool descriptions", () => {
  it.each([
    ["runner_create", RUNNER_CREATE_DESCRIPTION],
    ["acl_manage", ACL_MANAGE_DESCRIPTION],
    ["job_create", JOB_CREATE_DESCRIPTION],
    ["job_validate", JOB_VALIDATE_DESCRIPTION],
  ])("%s's description declares it is prioritized over api_call", (_name, description) => {
    expect(description).toContain("Prioritized over");
    expect(description).toContain("api_call");
  });
});

describe("API_CALL_DESCRIPTION", () => {
  it("references all four specialized tools as preferred alternatives", () => {
    expect(API_CALL_DESCRIPTION).toContain("runner_create");
    expect(API_CALL_DESCRIPTION).toContain("acl_manage");
    expect(API_CALL_DESCRIPTION).toContain("job_create");
    expect(API_CALL_DESCRIPTION).toContain("job_validate");
  });

  it("does not duplicate the old hand-written job_create/job_validate bullets", () => {
    expect(API_CALL_DESCRIPTION).not.toContain("Creating job definitions (use job_create instead)");
    expect(API_CALL_DESCRIPTION).not.toContain("Validating job definitions (use job_validate instead)");
  });

  it("still contains the untouched documentation bullet", () => {
    expect(API_CALL_DESCRIPTION).toContain(
      "Reading documentation (use resources instead: rundeck://docs/*)"
    );
  });
});
