"use client";

const nodeTemplates = [
  { type: "image", label: "Bild", icon: "🖼️", category: "Quelle" },
  { type: "text", label: "Text", icon: "📝", category: "Quelle" },
  { type: "prompt", label: "Prompt", icon: "✨", category: "Quelle" },
  { type: "note", label: "Notiz", icon: "📌", category: "Layout" },
  { type: "frame", label: "Frame", icon: "🖥️", category: "Layout" },
  { type: "group", label: "Gruppe", icon: "📁", category: "Layout" },
  { type: "compare", label: "Vergleich", icon: "🔀", category: "Layout" },
] as const;

const categories = [...new Set(nodeTemplates.map((template) => template.category))];

function SidebarItem({
  type,
  label,
  icon,
}: {
  type: string;
  label: string;
  icon: string;
}) {
  const onDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData("application/lemonspace-node-type", type);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex cursor-grab items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent active:cursor-grabbing"
    >
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

export default function CanvasSidebar() {
  return (
    <aside className="flex w-56 flex-col border-r bg-background">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Nodes</h2>
        <p className="text-xs text-muted-foreground">Auf den Canvas ziehen</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {categories.map((category) => (
          <div key={category} className="mb-4">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {category}
            </h3>
            <div className="flex flex-col gap-1.5">
              {nodeTemplates
                .filter((template) => template.category === category)
                .map((template) => (
                  <SidebarItem
                    key={template.type}
                    type={template.type}
                    label={template.label}
                    icon={template.icon}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
