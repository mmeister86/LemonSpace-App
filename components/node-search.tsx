import { useCallback, useState } from "react";

import {
  BuiltInEdge,
  useReactFlow,
  type Node,
  type PanelProps,
} from "@xyflow/react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface NodeSearchProps extends Omit<PanelProps, "children"> {
  // The function to search for nodes, should return an array of nodes that match the search string
  // By default, it will check for lowercase string inclusion.
  onSearch?: (searchString: string) => Node[];
  // The function to select a node, should set the node as selected and fit the view to the node
  // By default, it will set the node as selected and fit the view to the node.
  onSelectNode?: (node: Node) => void;
  getNodeLabel?: (node: Node) => string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placeholder?: string;
}

export function NodeSearchInternal({
  getNodeLabel,
  onSearch,
  onSelectNode,
  open,
  onOpenChange,
  placeholder = "Search nodes...",
}: NodeSearchProps) {
  const [searchResults, setSearchResults] = useState<Node[]>([]);
  const [searchString, setSearchString] = useState<string>("");
  const { getNodes, fitView, setNodes } = useReactFlow<Node, BuiltInEdge>();

  const defaultOnSearch = useCallback(
    (searchString: string) => {
      const nodes = getNodes();
      return nodes.filter((node) =>
        (getNodeLabel?.(node) ?? String(node.data.label ?? node.id))
          .toLowerCase()
          .includes(searchString.toLowerCase()),
      );
    },
    [getNodeLabel, getNodes],
  );

  const onChange = useCallback(
    (searchString: string) => {
      setSearchString(searchString);
      if (searchString.length > 0) {
        onOpenChange?.(true);
        const results = (onSearch || defaultOnSearch)(searchString);
        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    },
    [defaultOnSearch, onOpenChange, onSearch],
  );

  const defaultOnSelectNode = useCallback(
    (node: Node) => {
      setNodes((nodes) =>
        nodes.map((n) => (n.id === node.id ? { ...n, selected: true } : n)),
      );
      fitView({ nodes: [node], duration: 500 });
    },
    [fitView, setNodes],
  );

  const onSelect = useCallback(
    (node: Node) => {
      (onSelectNode || defaultOnSelectNode)?.(node);
      setSearchString("");
      onOpenChange?.(false);
    },
    [onSelectNode, defaultOnSelectNode, onOpenChange],
  );

  return (
    <>
      <CommandInput
        placeholder={placeholder}
        onValueChange={onChange}
        value={searchString}
        onFocus={() => onOpenChange?.(true)}
      />

      {open && (
        <CommandList>
          {searchResults.length === 0 ? (
            <CommandEmpty>No results found. {searchString}</CommandEmpty>
          ) : (
            <CommandGroup heading="Nodes">
              {searchResults.map((node) => {
                return (
                  <CommandItem key={node.id} onSelect={() => onSelect(node)}>
                    <span>{getNodeLabel?.(node) ?? String(node.data.label ?? node.id)}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
        </CommandList>
      )}
    </>
  );
}

export function NodeSearch({
  className,
  getNodeLabel,
  onSearch,
  onSelectNode,
  placeholder,
  ...props
}: NodeSearchProps) {
  const [open, setOpen] = useState(false);
  return (
    <Command
      shouldFilter={false}
      className={cn("rounded-lg border shadow-md md:min-w-[450px]", className)}
    >
      <NodeSearchInternal
        getNodeLabel={getNodeLabel}
        onSearch={onSearch}
        onSelectNode={onSelectNode}
        open={open}
        onOpenChange={setOpen}
        placeholder={placeholder}
        {...props}
      />
    </Command>
  );
}

export interface NodeSearchDialogProps extends NodeSearchProps {
  title?: string;
}

export function NodeSearchDialog({
  className,
  getNodeLabel,
  onSearch,
  onSelectNode,
  open,
  onOpenChange,
  placeholder,
  title = "Node Search",
  ...props
}: NodeSearchDialogProps) {
  return (
    <CommandDialog title={title} open={open} onOpenChange={onOpenChange}>
      <Command
        shouldFilter={false}
        className={cn("rounded-none border-0 shadow-none", className)}
      >
        <NodeSearchInternal
          getNodeLabel={getNodeLabel}
          onSearch={onSearch}
          onSelectNode={onSelectNode}
          open={open}
          onOpenChange={onOpenChange}
          placeholder={placeholder}
          {...props}
        />
      </Command>
    </CommandDialog>
  );
}
