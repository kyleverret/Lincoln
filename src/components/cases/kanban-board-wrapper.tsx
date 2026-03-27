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

    router.refresh();
  };

  const handleColumnCreate = async (name: string, color: string) => {
    const response = await fetch("/api/kanban/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color, boardId }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || "Failed to create column");
    }

    router.refresh();
  };

  const handleColumnUpdate = async (
    columnId: string,
    data: { name?: string; color?: string; wipLimit?: number | null }
  ) => {
    const response = await fetch(`/api/kanban/columns/${columnId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const resData = await response.json();
      throw new Error(resData.message || "Failed to update column");
    }

    router.refresh();
  };

  const handleColumnDelete = async (columnId: string) => {
    const response = await fetch(`/api/kanban/columns/${columnId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || "Failed to delete column");
    }

    router.refresh();
  };

  return (
    <KanbanBoard
      columns={columns}
      canManage={canManage}
      onCardMove={handleCardMove}
      onColumnCreate={handleColumnCreate}
      onColumnUpdate={handleColumnUpdate}
      onColumnDelete={handleColumnDelete}
    />
  );
}
