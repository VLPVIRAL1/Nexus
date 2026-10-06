export interface DependencyGraphResolution {
  order: string[];
  cycles: string[][];
}

export function resolveDependencyGraph(graph: Record<string, string[]>): DependencyGraphResolution {
  const state = new Map<string, "visiting" | "visited">();
  const order: string[] = [];
  const cycles: string[][] = [];
  const stack: string[] = [];

  function visit(node: string): void {
    const current = state.get(node);
    if (current === "visited") return;
    if (current === "visiting") {
      const start = stack.lastIndexOf(node);
      cycles.push([...stack.slice(start), node]);
      return;
    }
    state.set(node, "visiting");
    stack.push(node);
    for (const dependency of graph[node] ?? []) {
      if (dependency in graph) visit(dependency);
    }
    stack.pop();
    state.set(node, "visited");
    order.push(node);
  }

  for (const node of Object.keys(graph)) visit(node);
  return { order, cycles };
}
