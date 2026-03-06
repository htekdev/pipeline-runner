/**
 * Cross-job and cross-stage output variable store.
 * Steps can set output variables during execution (via logging commands),
 * and downstream jobs/stages can read them through the dependency context.
 */
export class OutputVariableStore {
  // jobName → stepName.variableName → value
  private readonly outputs: Map<string, Map<string, string>> = new Map();
  // jobName → stepName.variableName → isSecret
  private readonly secretFlags: Map<string, Map<string, boolean>> = new Map();
  // jobName → result (e.g., 'Succeeded', 'Failed')
  private readonly jobResults: Map<string, string> = new Map();

  // stageName → jobName → stepName.variableName → value
  private readonly stageOutputs: Map<string, Map<string, Map<string, string>>> =
    new Map();
  // stageName → jobName → result
  private readonly stageJobResults: Map<string, Map<string, string>> = new Map();

  /** Record an output variable from a step. */
  setOutput(
    jobName: string,
    stepName: string,
    variableName: string,
    value: string,
    isSecret?: boolean,
  ): void {
    const key = `${stepName}.${variableName}`;

    if (!this.outputs.has(jobName)) {
      this.outputs.set(jobName, new Map());
    }
    this.outputs.get(jobName)!.set(key, value);

    if (!this.secretFlags.has(jobName)) {
      this.secretFlags.set(jobName, new Map());
    }
    this.secretFlags.get(jobName)!.set(key, isSecret ?? false);
  }

  /**
   * Get an output variable.
   * @param jobName The job that produced the output
   * @param stepRef The step reference in 'stepName.variableName' format
   */
  getOutput(jobName: string, stepRef: string): string | undefined {
    return this.outputs.get(jobName)?.get(stepRef);
  }

  /** Check if an output variable is a secret. */
  isOutputSecret(jobName: string, stepRef: string): boolean {
    return this.secretFlags.get(jobName)?.get(stepRef) ?? false;
  }

  /** Get all outputs for a job (for expression context). */
  getJobOutputs(jobName: string): Record<string, string> {
    const jobOutputs = this.outputs.get(jobName);
    if (!jobOutputs) {
      return {};
    }
    const result: Record<string, string> = {};
    for (const [key, value] of jobOutputs) {
      result[key] = value;
    }
    return result;
  }

  /** Record job result status. */
  setJobResult(jobName: string, result: string): void {
    this.jobResults.set(jobName, result);
  }

  /** Get job result. */
  getJobResult(jobName: string): string | undefined {
    return this.jobResults.get(jobName);
  }

  /**
   * Build the dependencies context for expression evaluation.
   * Returns: `{ jobName: { result: string, outputs: { 'stepName.varName': value } } }`
   */
  buildDependencyContext(): Record<
    string,
    { result: string; outputs: Record<string, string> }
  > {
    const context: Record<
      string,
      { result: string; outputs: Record<string, string> }
    > = {};

    // Include all jobs that have results or outputs
    const allJobNames = new Set([
      ...this.jobResults.keys(),
      ...this.outputs.keys(),
    ]);

    for (const jobName of allJobNames) {
      context[jobName] = {
        result: this.jobResults.get(jobName) ?? 'Succeeded',
        outputs: this.getJobOutputs(jobName),
      };
    }
    return context;
  }

  /**
   * Record a stage-level output (for cross-stage references).
   * Stored as: stageName → jobName → stepName.variableName → value
   */
  setStageLevelOutput(
    stageName: string,
    jobName: string,
    stepName: string,
    variableName: string,
    value: string,
  ): void {
    if (!this.stageOutputs.has(stageName)) {
      this.stageOutputs.set(stageName, new Map());
    }
    const stageMap = this.stageOutputs.get(stageName)!;
    if (!stageMap.has(jobName)) {
      stageMap.set(jobName, new Map());
    }
    const key = `${stepName}.${variableName}`;
    stageMap.get(jobName)!.set(key, value);
  }

  /** Set stage-level job result. */
  setStageLevelJobResult(
    stageName: string,
    jobName: string,
    result: string,
  ): void {
    if (!this.stageJobResults.has(stageName)) {
      this.stageJobResults.set(stageName, new Map());
    }
    this.stageJobResults.get(stageName)!.set(jobName, result);
  }

  /**
   * Build stage dependencies context for cross-stage expression evaluation.
   * Returns: `{ stageName: { jobName: { result, outputs } } }`
   */
  buildStageDependencyContext(): Record<
    string,
    Record<string, { result: string; outputs: Record<string, string> }>
  > {
    const context: Record<
      string,
      Record<string, { result: string; outputs: Record<string, string> }>
    > = {};

    // Collect all stage names from both results and outputs
    const allStageNames = new Set([
      ...this.stageJobResults.keys(),
      ...this.stageOutputs.keys(),
    ]);

    for (const stageName of allStageNames) {
      context[stageName] = {};
      const stageJobs = this.stageOutputs.get(stageName);
      const stageResults = this.stageJobResults.get(stageName);

      // Collect all job names for this stage
      const allJobNames = new Set([
        ...(stageResults?.keys() ?? []),
        ...(stageJobs?.keys() ?? []),
      ]);

      for (const jobName of allJobNames) {
        const outputs: Record<string, string> = {};
        const jobOutputs = stageJobs?.get(jobName);
        if (jobOutputs) {
          for (const [key, value] of jobOutputs) {
            outputs[key] = value;
          }
        }
        context[stageName][jobName] = {
          result: stageResults?.get(jobName) ?? 'Succeeded',
          outputs,
        };
      }
    }

    return context;
  }
}
