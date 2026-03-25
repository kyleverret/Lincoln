"use client";

import { KanbanBoard, type KanbanColumnData } from "./kanban-board";
import { useRouter } from "next/navigation";

interface KanbanBoardWrapperProps {
  columns: KanbanColumnData[];
  canManage: boolean;
  boardId: string;
}

export function KanbanBoardWrapper({
  columns,
  canManage,
  boardId,
}: KanbanBoardWrapperProps) {
  const router = useRouter();

  const handleCardMove = async (
    cardId: string,
    sourceColumnId: string,
    targetColumnId: string,
    newPosition: number
  ) => {
    const response = await fetch(`/api/kanban/cards/${cardId}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetColumnId, newPosition }),
    });

    if (!response.ok) {
      throw new Error("Failed to move card");
    }

    // Refresh server data in background
    router.refresh();
  };

  return (
    <KanbanBoard
      columns={columns}
      canManage={canManage}
      onCardMove={handleCardMove}
    />
  );
}
