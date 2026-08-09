import { useMemo } from "react";
import { computeFamilyTreeLayout, parseRelationships, type FamilyTreeLineKind } from "@/lib/noteTypes/familyTree";

const COL_WIDTH = 170;
const ROW_HEIGHT = 120;
const NODE_WIDTH = 150;
const NODE_HEIGHT = 46;
const PADDING = 30;

const SOCIAL_LINE_KINDS: FamilyTreeLineKind[] = ["friend", "rival", "enemy", "romantic"];

// Stroke color per line kind — mirrors the Electron app's .family-tree-line-*
// CSS classes, translated to inline styles (this repo has no equivalent
// classes, but the same --color-* theme vars from globals.css apply here).
const LINE_STYLE: Record<FamilyTreeLineKind, React.CSSProperties> = {
  "parent-child": { stroke: "var(--color-border)" },
  spouse: { stroke: "var(--color-accent)" },
  sibling: { stroke: "var(--color-muted)", strokeDasharray: "4 3" },
  // Social ties share a tighter dot pattern than sibling's dash, so the
  // family-vs-social grouping reads at a glance from line STYLE alone, with
  // color layered on top to distinguish which social tie it is.
  friend: { stroke: "var(--color-positive)", strokeDasharray: "1.5 3.5", strokeLinecap: "round" },
  rival: { stroke: "var(--color-warning)", strokeDasharray: "1.5 3.5", strokeLinecap: "round" },
  enemy: { stroke: "var(--color-danger)", strokeDasharray: "1.5 3.5", strokeLinecap: "round" },
  romantic: { stroke: "var(--color-romantic)", strokeDasharray: "1.5 3.5", strokeLinecap: "round" },
};

const LEGEND_ROWS: { kind: FamilyTreeLineKind; label: string }[] = [
  { kind: "parent-child", label: "Parent / child" },
  { kind: "spouse", label: "Spouse" },
  { kind: "sibling", label: "Sibling" },
  { kind: "friend", label: "Friend" },
  { kind: "rival", label: "Rival" },
  { kind: "enemy", label: "Enemy" },
  { kind: "romantic", label: "Romantic partner" },
];

// Adapted from the Electron app's FamilyTreeDiagram.tsx — same generational
// SVG layout, CSS classes translated to inline styles/Tailwind.
export function FamilyTreeDiagram({ body, onOpenPerson }: { body: string; onOpenPerson: (name: string) => void }) {
  const layout = useMemo(() => computeFamilyTreeLayout(parseRelationships(body)), [body]);

  if (layout.nodes.length === 0) {
    return (
      <p className="mt-3 pt-3 border-t border-border text-xs text-muted">
        No relationships yet — add a &quot;## Relationships&quot; heading below and list people with [[wiki-links]],
        e.g. &quot;- [[Parent]] parent of [[Child]]&quot;.
      </p>
    );
  }

  const positionOf = new Map(
    layout.nodes.map((n) => [
      n.name,
      { x: n.col * COL_WIDTH + COL_WIDTH / 2 + PADDING, y: n.generation * ROW_HEIGHT + NODE_HEIGHT / 2 + PADDING },
    ])
  );
  const maxCol = Math.max(...layout.nodes.map((n) => n.col));
  const maxGeneration = Math.max(...layout.nodes.map((n) => n.generation));
  const width = (maxCol + 1) * COL_WIDTH + PADDING * 2;
  const height = (maxGeneration + 1) * ROW_HEIGHT + PADDING * 2;

  const parentsByChild = new Map<string, string[]>();
  for (const line of layout.lines) {
    if (line.kind !== "parent-child") continue;
    const parents = parentsByChild.get(line.to) ?? [];
    parents.push(line.from);
    parentsByChild.set(line.to, parents);
  }

  return (
    <div className="mt-3 pt-3 border-t border-border overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {[...parentsByChild.entries()].map(([child, parents]) => {
          const childPos = positionOf.get(child);
          const parentPositions = parents.map((p) => positionOf.get(p)).filter((p) => p !== undefined);
          if (!childPos || parentPositions.length === 0) return null;

          // Drop from the midpoint of all recorded parents, jog sideways to
          // the child's column, then drop into it — the standard elbow-style
          // connector genealogy charts use, so multiple children sharing the
          // same parents all fan out from one shared point.
          const anchorX = parentPositions.reduce((sum, p) => sum + p.x, 0) / parentPositions.length;
          const anchorY = Math.max(...parentPositions.map((p) => p.y)) + NODE_HEIGHT / 2;
          const childTopY = childPos.y - NODE_HEIGHT / 2;
          const midY = anchorY + (childTopY - anchorY) / 2;
          const path = `M ${anchorX} ${anchorY} L ${anchorX} ${midY} L ${childPos.x} ${midY} L ${childPos.x} ${childTopY}`;
          return <path key={`pc-${child}`} fill="none" strokeWidth={1.5} style={LINE_STYLE["parent-child"]} d={path} />;
        })}
        {layout.lines
          .filter((l) => l.kind === "spouse")
          .map((line) => {
            const a = positionOf.get(line.from);
            const b = positionOf.get(line.to);
            if (!a || !b) return null;
            const left = a.x < b.x ? a : b;
            const right = a.x < b.x ? b : a;
            return (
              <line
                key={`sp-${line.from}-${line.to}`}
                strokeWidth={1.5}
                style={LINE_STYLE.spouse}
                x1={left.x + NODE_WIDTH / 2}
                y1={left.y}
                x2={right.x - NODE_WIDTH / 2}
                y2={right.y}
              />
            );
          })}
        {layout.lines
          .filter((l) => l.kind === "sibling")
          .map((line) => {
            const a = positionOf.get(line.from);
            const b = positionOf.get(line.to);
            if (!a || !b) return null;
            return (
              <line key={`sib-${line.from}-${line.to}`} strokeWidth={1.5} style={LINE_STYLE.sibling} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            );
          })}
        {SOCIAL_LINE_KINDS.map((kind) =>
          layout.lines
            .filter((l) => l.kind === kind)
            .map((line) => {
              const a = positionOf.get(line.from);
              const b = positionOf.get(line.to);
              if (!a || !b) return null;
              return (
                <line
                  key={`${kind}-${line.from}-${line.to}`}
                  strokeWidth={1.5}
                  style={LINE_STYLE[kind]}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                />
              );
            })
        )}
        {layout.nodes.map((node) => {
          const pos = positionOf.get(node.name)!;
          return (
            <g
              key={node.name}
              className="cursor-pointer"
              role="link"
              tabIndex={0}
              onClick={() => onOpenPerson(node.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onOpenPerson(node.name);
              }}
            >
              <rect
                x={pos.x - NODE_WIDTH / 2}
                y={pos.y - NODE_HEIGHT / 2}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={8}
                fill="var(--color-panel)"
                stroke="var(--color-border)"
              />
              <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="middle" fill="var(--color-normal)" fontSize={12}>
                {node.name}
                <title>{node.name}</title>
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-2.5 border-t border-border">
        {LEGEND_ROWS.map((row) => (
          <span key={row.kind} className="inline-flex items-center gap-1.5 text-xs text-muted">
            <svg width="20" height="10" aria-hidden="true">
              <line x1="0" y1="5" x2="20" y2="5" strokeWidth={1.5} style={LINE_STYLE[row.kind]} />
            </svg>
            {row.label}
          </span>
        ))}
      </div>
    </div>
  );
}
