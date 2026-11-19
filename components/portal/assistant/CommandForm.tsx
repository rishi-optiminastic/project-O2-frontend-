"use client";

import { useState } from "react";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Field, inputClass } from "@/components/portal/ui";
import { Button } from "@/components/ui/Button";
import { api, ApiError, type AssistantCommand } from "@/lib/api";

/** Adds or edits a saved "/" command: a name and the prompt it drops into the message box. */
export function CommandForm({
  command,
  onClose,
  onSaved,
}: {
  command: AssistantCommand | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The command could not be saved.");
      setSaving(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = { name: fd.get("name"), description: fd.get("description"), prompt: fd.get("prompt") };
    void run(() => (command ? api.put(`/assistant/commands/${command.id}`, body) : api.post("/assistant/commands", body)));
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={command ? `Edit /${command.name}` : "New command"}
      description="Type /name in Ask O2 to drop this prompt into the message box."
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Name">
          <input
            name="name"
            required
            pattern="/?[a-zA-Z][a-zA-Z0-9-]{1,30}"
            title="2 to 31 letters, numbers or dashes, starting with a letter"
            defaultValue={command?.name}
            placeholder="weekly"
            className={`${inputClass} font-mono`}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Shown in the menu">
            <input name="description" maxLength={160} defaultValue={command?.description} placeholder="Weekly money review" className={inputClass} />
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Prompt">
            <textarea
              name="prompt"
              required
              rows={4}
              maxLength={4000}
              defaultValue={command?.prompt}
              placeholder="Summarise this week's money in and out, and list anything overdue."
              className={`${inputClass} h-auto py-2.5`}
            />
          </Field>
        </div>

        {error && <p role="alert" className="sm:col-span-3 text-sm text-danger">⚠ {error}</p>}
        <ModalFooter>
          {command && (
            <Button
              type="button"
              variant="ghost"
              magnetic={false}
              disabled={saving}
              onClick={() => confirm(`Delete /${command.name}?`) && run(() => api.del(`/assistant/commands/${command.id}`))}
            >
              Delete
            </Button>
          )}
          <Button type="submit" magnetic={false} disabled={saving}>
            {saving ? "Saving…" : command ? "Save changes" : "Add command"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
