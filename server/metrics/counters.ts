/**
 * Prometheus-style Metrics Counters
 * 
 * Provides simple counter-based metrics for monitoring RAG pipeline performance.
 * Exports metrics in Prometheus text format for scraping.
 */

interface Counter {
  name: string;
  help: string;
  value: number;
  labels?: Record<string, string>;
}

interface CounterWithLabels {
  name: string;
  help: string;
  values: Map<string, number>;
}

const counters: Map<string, Counter> = new Map();
const labeledCounters: Map<string, CounterWithLabels> = new Map();

/**
 * Initializes all metric counters used by the RAG pipeline
 */
function initializeCounters(): void {
  counters.set("ingest_llm_calls_total", {
    name: "ingest_llm_calls_total",
    help: "Total number of LLM API calls during ingestion (Gemini/Groq)",
    value: 0,
  });
  
  counters.set("rag_cold_start_total", {
    name: "rag_cold_start_total",
    help: "Number of times RAG fell back to legacy summary due to insufficient chunks",
    value: 0,
  });
  
  counters.set("mission_input_tokens_total", {
    name: "mission_input_tokens_total",
    help: "Total input tokens sent to Groq for mission generation",
    value: 0,
  });
  
  counters.set("rag_chunks_retrieved_total", {
    name: "rag_chunks_retrieved_total",
    help: "Total number of chunks retrieved from ChromaDB",
    value: 0,
  });
  
  counters.set("rag_chunks_ingested_total", {
    name: "rag_chunks_ingested_total",
    help: "Total number of chunks ingested into ChromaDB",
    value: 0,
  });
  
  counters.set("mastery_adjustments_total", {
    name: "mastery_adjustments_total",
    help: "Total number of mastery level adjustments made",
    value: 0,
  });
  
  labeledCounters.set("ingest_files_processed", {
    name: "ingest_files_processed_total",
    help: "Total files processed during ingestion by course",
    values: new Map(),
  });
  
  labeledCounters.set("ingest_duration_seconds", {
    name: "ingest_duration_seconds_total",
    help: "Total time spent ingesting files in seconds",
    values: new Map(),
  });
}

initializeCounters();

/**
 * Increments a counter by a given value
 * @param name - Counter name
 * @param value - Value to add (default: 1)
 */
export function incrementCounter(name: string, value: number = 1): void {
  const counter = counters.get(name);
  if (counter) {
    counter.value += value;
  } else {
    counters.set(name, {
      name,
      help: `Counter: ${name}`,
      value,
    });
  }
}

/**
 * Increments a labeled counter
 * @param name - Counter name
 * @param label - Label value (e.g., course code)
 * @param value - Value to add (default: 1)
 */
export function incrementLabeledCounter(
  name: string,
  label: string,
  value: number = 1
): void {
  let counter = labeledCounters.get(name);
  if (!counter) {
    counter = {
      name: `${name}_total`,
      help: `Labeled counter: ${name}`,
      values: new Map(),
    };
    labeledCounters.set(name, counter);
  }
  
  const current = counter.values.get(label) || 0;
  counter.values.set(label, current + value);
}

/**
 * Gets the current value of a counter
 * @param name - Counter name
 * @returns Current counter value or 0 if not found
 */
export function getCounterValue(name: string): number {
  return counters.get(name)?.value || 0;
}

/**
 * Gets all values for a labeled counter
 * @param name - Counter name
 * @returns Map of label -> value pairs
 */
export function getLabeledCounterValues(name: string): Map<string, number> {
  return labeledCounters.get(name)?.values || new Map();
}

/**
 * Resets all counters to zero
 * Useful for testing
 */
export function resetAllCounters(): void {
  counters.forEach((counter) => {
    counter.value = 0;
  });
  labeledCounters.forEach((counter) => {
    counter.values.clear();
  });
}

/**
 * Logs ingestion metrics after processing
 * @param courseCode - Course code
 * @param fileName - File name processed
 * @param chunkCount - Number of chunks created
 * @param durationMs - Duration in milliseconds
 */
export function logIngestionMetrics(
  courseCode: string,
  fileName: string,
  chunkCount: number,
  durationMs: number
): void {
  console.log(
    `[Metrics] Ingest: courseCode=${courseCode}, fileName=${fileName}, chunkCount=${chunkCount}, durationMs=${durationMs}`
  );
  
  incrementCounter("rag_chunks_ingested_total", chunkCount);
  incrementLabeledCounter("ingest_files_processed", courseCode);
  incrementLabeledCounter("ingest_duration_seconds", courseCode, durationMs / 1000);
}

/**
 * Exports all metrics in Prometheus text format
 * @returns Prometheus-formatted metrics string
 */
export function exportMetrics(): string {
  const lines: string[] = [];
  
  counters.forEach((counter) => {
    lines.push(`# HELP ${counter.name} ${counter.help}`);
    lines.push(`# TYPE ${counter.name} counter`);
    lines.push(`${counter.name} ${counter.value}`);
    lines.push("");
  });
  
  labeledCounters.forEach((counter) => {
    lines.push(`# HELP ${counter.name} ${counter.help}`);
    lines.push(`# TYPE ${counter.name} counter`);
    counter.values.forEach((value, label) => {
      lines.push(`${counter.name}{course="${label}"} ${value}`);
    });
    lines.push("");
  });
  
  return lines.join("\n");
}

/**
 * Tracks LLM call for ingestion
 */
export function trackIngestLLMCall(): void {
  incrementCounter("ingest_llm_calls_total");
}

/**
 * Tracks RAG cold start (fallback to summary)
 */
export function trackRagColdStart(): void {
  incrementCounter("rag_cold_start_total");
}

/**
 * Tracks mission input tokens
 * @param tokens - Number of tokens
 */
export function trackMissionInputTokens(tokens: number): void {
  incrementCounter("mission_input_tokens_total", tokens);
}

/**
 * Tracks chunks retrieved
 * @param count - Number of chunks
 */
export function trackChunksRetrieved(count: number): void {
  incrementCounter("rag_chunks_retrieved_total", count);
}

/**
 * Tracks mastery adjustment
 */
export function trackMasteryAdjustment(): void {
  incrementCounter("mastery_adjustments_total");
}
