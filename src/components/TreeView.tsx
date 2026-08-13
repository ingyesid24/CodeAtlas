import { useState } from 'react';
import type { FileNode } from '../analyzer/types';

interface TreeViewProps {
  node: FileNode;
  depth?: number;
}

export default function TreeView({ node, depth = 0 }: TreeViewProps) {
  const [open, setOpen] = useState(depth < 1);

  if (node.type === 'file') {
    return <div className="tree-row tree-file" style={{ paddingLeft: depth * 16 }}>{node.name}</div>;
  }

  const children = node.children ?? [];

  return (
    <div>
      <div
        className="tree-row tree-dir"
        style={{ paddingLeft: depth * 16 }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="tree-caret">{open ? '▾' : '▸'}</span> {node.name}
        <span className="muted tree-count"> ({children.length})</span>
      </div>
      {open && children.map((child) => (
        <TreeView key={child.path || child.name} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}
