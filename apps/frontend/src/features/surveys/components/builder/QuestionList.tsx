import { Button } from '@fops/ui';
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import type { SurveyQuestion } from '../../types';

export function QuestionList({
  questions,
  editable,
  selectedId,
  onSelect,
  onRemove,
  onAdd,
  onReorder,
}: {
  questions: SurveyQuestion[];
  editable: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);
  return (
    <section className="border-r border-border-subtle p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">Questions {questions.length}</span>
        {editable && (
          <Button size="sm" onClick={onAdd}>
            <Plus className="h-4 w-4" />새 질문 추가
          </Button>
        )}
      </div>
      <div className="space-y-1">
        {questions.map((question, index) => (
          <div
            key={question.id}
            draggable={editable}
            data-testid={`survey-question-row-${question.id}`}
            data-drag-over={overIndex === index ? 'true' : undefined}
            onDragStart={(event) => {
              if (!editable) return;
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', String(index));
              setDragIndex(index);
            }}
            onDragOver={(event) => {
              if (!editable) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setOverIndex(index);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragIndex !== null) onReorder(dragIndex, index);
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            className={`relative w-full rounded text-left text-sm hover:bg-surface-card ${selectedId === question.id ? 'bg-surface-card' : ''} ${overIndex === index ? 'ring-2 ring-focus-ring' : ''}`}
          >
            <button
              type="button"
              onClick={() => onSelect(question.id)}
              className="flex w-full items-center gap-2 px-2 py-2 pr-28 text-left"
            >
              {editable && <GripVertical className="h-3.5 w-3.5" aria-label="질문 드래그 핸들" />}
              <span>Q{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{question.prompt || '제목 없음'}</span>
            </button>
            {editable && (
              <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onReorder(index, index - 1)}
                  aria-label={`Q${index + 1} 위로 이동`}
                  disabled={index === 0}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onReorder(index, index + 1)}
                  aria-label={`Q${index + 1} 아래로 이동`}
                  disabled={index === questions.length - 1}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onRemove(question.id)} aria-label="질문 삭제">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
