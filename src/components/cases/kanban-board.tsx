"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useCallback, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  MoreHorizontal,
  Plus,
  AlertCircle,
  Calendar,
  GripVertical,
  Users,
  X,
  Check,
} from "lucide-react";
import Link from "next/link";
import {
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  formatDate,
  cn,
} from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface KanbanCardData {
  id: string;
  matterId: string;
  title: string;
  matterNumber: string;
  priority: string;
  status: string;
  dueDate: string | null;
  clientName: string | null;
  assigneeNames: string[];
  labels: string[];
  documentCount: number;
}

export interface KanbanColumnData {
  id: string;
  name: string;
  color: string;
  position: number;
  wipLimit: number | null;
  cards: KanbanCardData[];
}

interface KanbanBoardProps {
  columns: KanbanColumnData[];
  canManage: boolean;
  onCardMove: (
    cardId: string,
    sourceColumnId: string,
    targetColumnId: string,
    newPosition: number
  ) => Promise<void>;
  onColumnCreate?: (name: string, color: string) => Promise<void>;
  onColumnUpdate?: (
    columnId: string,
    data: { name?: string; color?: string; wipLimit?: number | null }
  ) => Promise<void>;
  onColumnDelete?: (columnId: string) => Promise<void>;
}

const COLUMN_COLORS = [
  "#8b5cf6",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#6b7280",
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
  "#ef4444",
  "#a855f7",
];

// ---------------------------------------------------------------------------
// Card component
// ---------------------------------------------------------------------------

function KanbanCard({
  card,
  isDragging,
}: {
  card: KanbanCardData;
  isDragging?: boolean;
}) {
  const isOverdue = card.dueDate && new Date(card.dueDate) < new Date();
  const isUrgent = card.priority === "URGENT";

  return (
    <Card
      className={cn(
        "p-3 cursor-grab active:cursor-grabbing select-none",
        isDragging && "opacity-50 rotate-1 shadow-lg",
        isUrgent && "border-l-2 border-l-red-500"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <Link
          href={`/cases/${card.matterId}`}
          className="text-sm font-medium leading-tight hover:underline line-clamp-2 flex-1"
          onClick={(e) => e.stopPropagation()}
        >
          {card.title}
        </Link>
        {isUrgent && (
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
        )}
      </div>

      <p className="text-xs text-muted-foreground mb-2">{card.matterNumber}</p>

      {card.clientName && (
        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
          <Users className="h-3 w-3" />
          {card.clientName}
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-teal-100 text-[9px] font-semibold text-teal-700 ml-0.5 shrink-0">
            C
          </span>
        </p>
      )}

      {card.dueDate && (
        <p
          className={cn(
            "text-xs mb-2 flex items-center gap-1",
            isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"
          )}
        >
          <Calendar className="h-3 w-3" />
          {formatDate(card.dueDate)}
        </p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          <Badge
            className={
              PRIORITY_COLORS[card.priority as keyof typeof PRIORITY_COLORS]
            }
            variant="outline"
          >
            {PRIORITY_LABELS[card.priority as keyof typeof PRIORITY_LABELS]}
          </Badge>
          {card.labels.slice(0, 2).map((label) => (
            <Badge key={label} variant="secondary" className="text-xs">
              {label}
            </Badge>
          ))}
        </div>
        {card.documentCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {card.documentCount} doc{card.documentCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {card.assigneeNames.length > 0 && (
        <div className="mt-2 flex gap-1">
          {card.assigneeNames.slice(0, 3).map((name, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-0.5"
              title={name}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-medium">
                {name[0]?.toUpperCase()}
              </span>
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded bg-blue-100 text-[8px] font-semibold text-blue-700">
                A
              </span>
            </span>
          ))}
          {card.assigneeNames.length > 3 && (
            <span className="inline-flex h-5 items-center text-[10px] text-muted-foreground">
              +{card.assigneeNames.length - 3}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sortable card wrapper
// ---------------------------------------------------------------------------

function SortableCard({ card }: { card: KanbanCardData }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCard card={card} isDragging={isDragging} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column component
// ---------------------------------------------------------------------------

function KanbanColumn({
  column,
  canManage,
  onColumnUpdate,
  onColumnDelete,
}: {
  column: KanbanColumnData;
  canManage: boolean;
  onColumnUpdate?: (
    columnId: string,
    data: { name?: string; color?: string; wipLimit?: number | null }
  ) => Promise<void>;
  onColumnDelete?: (columnId: string) => Promise<void>;
}) {
  const isOverWip =
    column.wipLimit !== null && column.cards.length > column.wipLimit;
  const cardIds = column.cards.map((c) => c.id);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(column.name);
  const [editColor, setEditColor] = useState(column.color);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  const handleSaveEdit = async () => {
    if (!editName.trim() || !onColumnUpdate) return;
    setIsSaving(true);
    try {
      await onColumnUpdate(column.id, { name: editName.trim(), color: editColor });
      setIsEditing(false);
    } catch {
      // keep editing on error
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditName(column.name);
    setEditColor(column.color);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!onColumnDelete) return;
    setIsSaving(true);
    try {
      await onColumnDelete(column.id);
    } catch {
      // stay on confirm state on error
      setIsSaving(false);
    }
  };

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30">
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b">
        {isEditing ? (
          <div className="flex-1 space-y-2">
            <input
              ref={editInputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveEdit();
                if (e.key === "Escape") handleCancelEdit();
              }}
              className="w-full rounded border px-2 py-1 text-sm bg-background"
              placeholder="Column name"
            />
            <div className="flex gap-1 flex-wrap">
              {COLUMN_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEditColor(c)}
                  className={cn(
                    "h-5 w-5 rounded-full border-2 transition-transform",
                    editColor === c
                      ? "border-foreground scale-110"
                      : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2"
                onClick={handleSaveEdit}
                disabled={isSaving || !editName.trim()}
              >
                <Check className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2"
                onClick={handleCancelEdit}
                disabled={isSaving}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ) : isDeleting ? (
          <div className="flex-1 space-y-2">
            <p className="text-xs text-destructive font-medium">
              Delete &quot;{column.name}&quot;?
              {column.cards.length > 0 && (
                <span className="block text-xs font-normal mt-1">
                  This column has {column.cards.length} card(s). Move them first.
                </span>
              )}
            </p>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="destructive"
                className="h-6 px-2 text-xs"
                onClick={handleDelete}
                disabled={isSaving}
              >
                {isSaving ? "Deleting..." : "Delete"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => setIsDeleting(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: column.color }}
              />
              <span className="text-sm font-semibold">{column.name}</span>
              <span
                className={cn(
                  "ml-1 rounded-full px-1.5 py-0.5 text-xs font-medium",
                  isOverWip
                    ? "bg-red-100 text-red-700"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {column.cards.length}
                {column.wipLimit && `/${column.wipLimit}`}
              </span>
            </div>
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setIsEditing(true)}>
                    Edit column
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setIsDeleting(true)}
                  >
                    Delete column
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px]">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {column.cards.map((card) => (
            <SortableCard key={card.id} card={card} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export function KanbanBoard({
  columns: initialColumns,
  canManage,
  onCardMove,
  onColumnCreate,
  onColumnUpdate,
  onColumnDelete,
}: KanbanBoardProps) {
  const [columns, setColumns] = useState(initialColumns);
  const [activeCard, setActiveCard] = useState<KanbanCardData | null>(null);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnColor, setNewColumnColor] = useState(COLUMN_COLORS[0]);
  const [isCreating, setIsCreating] = useState(false);
  const addColumnInputRef = useRef<HTMLInputElement>(null);

  // Sync columns when initialColumns changes (e.g. after router.refresh())
  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  useEffect(() => {
    if (showAddColumn && addColumnInputRef.current) {
      addColumnInputRef.current.focus();
    }
  }, [showAddColumn]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const findColumnByCardId = useCallback(
    (cardId: string) =>
      columns.find((col) => col.cards.some((c) => c.id === cardId)),
    [columns]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const card = columns
      .flatMap((c) => c.cards)
      .find((c) => c.id === event.active.id);
    setActiveCard(card ?? null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeColumnId = findColumnByCardId(active.id as string)?.id;
    // over can be a column or a card
    const overColumn =
      columns.find((c) => c.id === over.id) ??
      findColumnByCardId(over.id as string);

    if (!activeColumnId || !overColumn) return;
    if (activeColumnId === overColumn.id) return;

    setColumns((prev) => {
      const srcCol = prev.find((c) => c.id === activeColumnId)!;
      const dstCol = prev.find((c) => c.id === overColumn.id)!;
      const card = srcCol.cards.find((c) => c.id === active.id)!;

      return prev.map((col) => {
        if (col.id === srcCol.id) {
          return { ...col, cards: col.cards.filter((c) => c.id !== active.id) };
        }
        if (col.id === dstCol.id) {
          return { ...col, cards: [...col.cards, card] };
        }
        return col;
      });
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);
    if (!over) return;

    const sourceColumn = findColumnByCardId(active.id as string);
    const targetColumn =
      columns.find((c) => c.id === over.id) ??
      findColumnByCardId(over.id as string);

    if (!sourceColumn || !targetColumn) return;

    // Reorder within column
    if (sourceColumn.id === targetColumn.id) {
      setColumns((prev) =>
        prev.map((col) => {
          if (col.id !== sourceColumn.id) return col;
          const oldIndex = col.cards.findIndex((c) => c.id === active.id);
          const newIndex = col.cards.findIndex((c) => c.id === over.id);
          return { ...col, cards: arrayMove(col.cards, oldIndex, newIndex) };
        })
      );
    }

    const newPosition =
      columns
        .find((c) => c.id === targetColumn.id)
        ?.cards.findIndex((c) => c.id === active.id) ?? 0;

    try {
      await onCardMove(
        active.id as string,
        sourceColumn.id,
        targetColumn.id,
        newPosition
      );
    } catch {
      // Revert on error
      setColumns(initialColumns);
    }
  };

  const handleAddColumn = async () => {
    if (!newColumnName.trim() || !onColumnCreate) return;
    setIsCreating(true);
    try {
      await onColumnCreate(newColumnName.trim(), newColumnColor);
      setNewColumnName("");
      setNewColumnColor(COLUMN_COLORS[0]);
      setShowAddColumn(false);
    } catch {
      // keep form open on error
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 items-start">
        {columns.map((column) => (
          <SortableContext
            key={column.id}
            items={[column.id]}
            strategy={verticalListSortingStrategy}
          >
            <KanbanColumn
              column={column}
              canManage={canManage}
              onColumnUpdate={onColumnUpdate}
              onColumnDelete={onColumnDelete}
            />
          </SortableContext>
        ))}

        {canManage && (
          showAddColumn ? (
            <div className="w-72 shrink-0 rounded-xl border-2 border-dashed p-3 space-y-2">
              <input
                ref={addColumnInputRef}
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddColumn();
                  if (e.key === "Escape") {
                    setShowAddColumn(false);
                    setNewColumnName("");
                  }
                }}
                className="w-full rounded border px-2 py-1.5 text-sm bg-background"
                placeholder="Column name"
              />
              <div className="flex gap-1 flex-wrap">
                {COLUMN_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColumnColor(c)}
                    className={cn(
                      "h-5 w-5 rounded-full border-2 transition-transform",
                      newColumnColor === c
                        ? "border-foreground scale-110"
                        : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  onClick={handleAddColumn}
                  disabled={isCreating || !newColumnName.trim()}
                >
                  {isCreating ? "Adding..." : "Add"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowAddColumn(false);
                    setNewColumnName("");
                  }}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddColumn(true)}
              className="flex w-72 shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add column
            </button>
          )
        )}
      </div>

      <DragOverlay>
        {activeCard && <KanbanCard card={activeCard} />}
      </DragOverlay>
    </DndContext>
  );
}
