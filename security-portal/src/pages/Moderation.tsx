import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, ModPost } from "../lib/api";

export function Moderation({ flash }: { flash: (m: string, bad?: boolean) => void }) {
  const [posts, setPosts] = useState<ModPost[]>([]);
  const load = useCallback(async () => {
    try { setPosts(await api.posts()); } catch (e) { flash(e instanceof Error ? e.message : "Could not load", true); }
  }, [flash]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (p: ModPost) => {
    try { await api.setPostHidden(p.id, !p.hidden); flash(p.hidden ? "Post restored" : "Post hidden"); load(); }
    catch (e) { flash(e instanceof Error ? e.message : "Failed", true); }
  };

  return (
    <>
      <h1>Content moderation</h1>
      <p className="muted">Hide harmful or misleading community posts. Hidden posts disappear from the app but remain here and in the audit log.</p>
      <div className="incident-list">
        {posts.map((p) => (
          <section className={`panel ${p.hidden ? "faded" : ""}`} key={p.id}>
            <div className="inc-head"><h3>{p.author_name}</h3><span className="chip">{p.tag}</span></div>
            <p>{p.body}</p>
            <div className="inc-actions">
              <small className="muted">{fmtDate(p.created_at)}</small>
              <button className="btn small" onClick={() => toggle(p)}>{p.hidden ? "Restore" : "Hide post"}</button>
            </div>
          </section>
        ))}
        {!posts.length && <p className="empty">No posts yet.</p>}
      </div>
    </>
  );
}
