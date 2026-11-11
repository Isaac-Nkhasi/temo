import { FormEvent, useCallback, useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { useAuth } from "../auth/AuthProvider";
import { addComment, createPost, fetchComments, fetchFeed, setLike } from "../lib/api";
import { initials, timeAgo } from "../lib/format";
import type { FeedComment, FeedPost } from "../lib/types";

export function Community({ flash }: { flash: (msg: string) => void }) {
  const { profile, can } = useAuth();
  const canWrite = can("community", "write");
  const uid = profile!.id;
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState("All");
  const [question, setQuestion] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, FeedComment[]>>({});
  const [reply, setReply] = useState("");

  const load = useCallback(async () => {
    try { setPosts(await fetchFeed()); }
    catch (e) { flash(e instanceof Error ? e.message : "Could not load posts"); }
    finally { setLoading(false); }
  }, [flash]);
  useEffect(() => { load(); }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim()) return;
    try {
      await createPost(uid, question);
      setQuestion("");
      await load();
    } catch (e) { flash(e instanceof Error ? e.message : "Could not post"); }
  };

  const toggleLike = async (post: FeedPost) => {
    const liked = !post.liked_by_me;
    setPosts((items) => items.map((p) =>
      p.id === post.id ? { ...p, liked_by_me: liked, like_count: p.like_count + (liked ? 1 : -1) } : p));
    try { await setLike(uid, post.id, liked); }
    catch (e) { flash(e instanceof Error ? e.message : "Could not update like"); load(); }
  };

  const toggleThread = async (post: FeedPost) => {
    if (open === post.id) { setOpen(null); return; }
    setOpen(post.id);
    setReply("");
    try { const list = await fetchComments(post.id); setComments((c) => ({ ...c, [post.id]: list })); }
    catch (e) { flash(e instanceof Error ? e.message : "Could not load replies"); }
  };

  const sendReply = async (event: FormEvent, post: FeedPost) => {
    event.preventDefault();
    if (!reply.trim()) return;
    try {
      await addComment(uid, post.id, reply);
      setReply("");
      const list = await fetchComments(post.id);
      setComments((c) => ({ ...c, [post.id]: list }));
      setPosts((items) => items.map((p) => (p.id === post.id ? { ...p, comment_count: list.length } : p)));
    } catch (e) { flash(e instanceof Error ? e.message : "Could not reply"); }
  };

  const visible = posts.filter((p) => topic === "All" || p.tag === topic || p.tag === "Question");

  return (
    <main className="screen">
      <div className="page-heading">
        <p className="eyebrow">FARMERS HELPING FARMERS</p>
        <h1>Community</h1>
        <span>Share knowledge. Grow together.</span>
      </div>
      <form className="ask-box" onSubmit={submit}>
        <div className="avatar">{initials(profile!.full_name)}</div>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={2000} disabled={!canWrite}
          placeholder={canWrite ? "Ask farmers a question..." : "Posting is disabled for your role"} aria-label="Ask a question" />
        <button type="submit" aria-label="Post question" disabled={!canWrite}><Icon name="arrow" size={19} /></button>
      </form>
      <div className="chips">
        {["All", "Crops", "Livestock", "Weather"].map((item) => (
          <button key={item} onClick={() => setTopic(item)} className={topic === item ? "active" : ""}>{item}</button>
        ))}
      </div>
      <div className="post-list">
        {visible.map((post) => (
          <article className="post" key={post.id}>
            <div className="post-author">
              <div className="avatar alt">{initials(post.author_name)}</div>
              <div>
                <strong>{post.author_name}</strong>
                <span>{post.author_district ?? "Lesotho"} · {timeAgo(post.created_at)}</span>
              </div>
              <em>{post.tag}</em>
            </div>
            <p>{post.body}</p>
            {post.image_url && <img className="post-photo" src={post.image_url} alt="" />}
            <div className="post-actions">
              <button className={post.liked_by_me ? "liked" : ""} onClick={() => toggleLike(post)}>
                <Icon name="heart" size={19} filled={post.liked_by_me} /> {post.like_count}
              </button>
              <button onClick={() => toggleThread(post)}>
                <Icon name="comment" size={19} /> {post.comment_count} replies
              </button>
            </div>
            {open === post.id && (
              <div className="thread">
                {(comments[post.id] ?? []).map((c) => (
                  <div className="thread-item" key={c.id}>
                    <div className="avatar alt">{initials(c.author_name)}</div>
                    <div><strong>{c.author_name}</strong> <small>{timeAgo(c.created_at)}</small><p>{c.body}</p></div>
                  </div>
                ))}
                {canWrite && <form className="thread-form" onSubmit={(e) => sendReply(e, post)}>
                  <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" maxLength={1000} />
                  <button type="submit" aria-label="Send reply"><Icon name="arrow" size={17} /></button>
                </form>}
              </div>
            )}
          </article>
        ))}
        {!loading && !visible.length && (
          <div className="empty"><Icon name="users" size={30} /><h3>No posts yet</h3><p>Ask the first question.</p></div>
        )}
      </div>
    </main>
  );
}
