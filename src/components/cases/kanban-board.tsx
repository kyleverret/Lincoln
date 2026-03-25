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
import { useState, useCallback } from "react";
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
}

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
              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-medium"
              title={name}
            >
              {name[0]?.toUpperCase()}
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
}: {
  column: KanbanColumnData;
  canManage: boolean;
}) {
  const isOverWip =
    column.wipLimit !== null && column.cards.length > column.wipLimit;
  const cardIds = column.cards.map((c) => c.id);

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30">
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b">
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
              <DropdownMenuItem>Edit column</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">
                Delete column
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
}: KanbanBoardProps) {
  const [columns, setColumns] = useState(initialColumns);
  const [activeCard, setActiveCard] = useState<KanbanCardData | null>(null);

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
            <KanbanColumn column={column} canManage={canManage} />
          </SortableContext>
        ))}

        {canManage && (
          <button className="flex w-72 shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors">
            <Plus className="h-4 w-4" />
            Add column
          </button>
        )}
      </div>

      <DragOverlay>
        {activeCard && <KanbanCard card={activeCard} />}
      </DragOverlay>
    </DndContext>
  );
}
