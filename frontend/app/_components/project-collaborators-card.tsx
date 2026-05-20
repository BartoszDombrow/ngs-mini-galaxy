"use client";

import { type FormEvent, useState } from "react";

import { apiRequest } from "@/lib/api";
import { ProjectMember } from "@/types";

type ProjectCollaboratorsCardProps = {
  projectId: number;
  members: ProjectMember[];
  canManageMembers: boolean;
  onMembersChange: (members: ProjectMember[]) => void;
};

function sortMembers(members: ProjectMember[]) {
  return [...members].sort((left, right) => {
    if (left.role !== right.role) {
      return left.role === "owner" ? -1 : 1;
    }
    return left.email.localeCompare(right.email);
  });
}

export function ProjectCollaboratorsCard({
  projectId,
  members,
  canManageMembers,
  onMembersChange,
}: ProjectCollaboratorsCardProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<number | null>(null);

  async function handleAddCollaborator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const member = await apiRequest<ProjectMember>(`/projects/${projectId}/members`, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      onMembersChange(sortMembers([...members, member]));
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się dodać współpracownika.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveCollaborator(memberUserId: number) {
    setError(null);
    setRemovingUserId(memberUserId);

    try {
      await apiRequest<void>(`/projects/${projectId}/members/${memberUserId}`, {
        method: "DELETE",
      });
      onMembersChange(members.filter((member) => member.user_id !== memberUserId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się usunąć współpracownika.");
    } finally {
      setRemovingUserId(null);
    }
  }

  return (
    <div className="card rounded-[2rem] p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Współpracownicy</h2>
          <p className="mt-1 text-sm text-muted">
            Osoby z dostępem mogą dodawać pliki, uruchamiać runy i przeglądać wyniki projektu.
          </p>
        </div>
        <span className="pill rounded-full px-3 py-1 text-xs text-muted">{members.length} osób</span>
      </div>
      {canManageMembers ? (
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => void handleAddCollaborator(event)}>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="E-mail istniejącego użytkownika"
            className="pill min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-full bg-accent px-4 py-3 text-sm text-white disabled:opacity-60"
          >
            {isSubmitting ? "Dodawanie..." : "Dodaj osobę"}
          </button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-muted">Tylko właściciel projektu może zmieniać listę współpracowników.</p>
      )}
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      <div className="mt-4 space-y-3">
        {members.map((member) => (
          <div
            key={member.user_id}
            className="pill flex flex-col gap-3 rounded-2xl px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span>{member.email}</span>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] uppercase tracking-[0.16em] ${
                    member.role === "owner" ? "bg-accent text-white" : "bg-black/5 text-muted"
                  }`}
                >
                  {member.role === "owner" ? "Właściciel" : "Współpraca"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Dostęp od {new Date(member.created_at).toLocaleString()}
              </p>
            </div>
            {canManageMembers && member.role !== "owner" ? (
              <button
                type="button"
                onClick={() => void handleRemoveCollaborator(member.user_id)}
                disabled={removingUserId === member.user_id}
                className="rounded-full border border-line px-4 py-2 text-xs text-danger disabled:opacity-60"
              >
                {removingUserId === member.user_id ? "Usuwanie..." : "Usuń"}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
