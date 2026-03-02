import { ExternalLink, Loader2, Radio, AlertCircle } from 'lucide-react';
import { useOSINTFeed } from '@/hooks/useOSINTFeed';
import { formatDistanceToNow } from 'date-fns';

export function OSINTPanel() {
  const { data: posts, isLoading, isError } = useOSINTFeed();

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Radio className="h-3 w-3 animate-pulse text-accent-green" />
          <span className="text-[9px] uppercase tracking-wider text-text-muted">
            Connecting to sources...
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
        </div>
      </div>
    );
  }

  if (isError || !posts || posts.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <AlertCircle className="h-3 w-3 text-red-500" />
          <span className="text-[9px] uppercase tracking-wider text-text-muted">
            {isError ? 'OSINT OFFLINE' : 'NO POSTS'}
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <span className="text-[9px] text-text-muted">
            GDELT fallback active — waiting for data
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Radio className="h-3 w-3 animate-pulse text-accent-green" />
        <span className="text-[9px] uppercase tracking-wider text-text-muted">
          {posts.length} posts from {countSources(posts)} sources
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {posts.slice(0, 20).map((post) => (
          <PostRow key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}

function PostRow({ post }: { post: { id: string; account: string; text: string; timestamp: string; url: string } }) {
  let ago = '';
  try {
    ago = formatDistanceToNow(new Date(post.timestamp), { addSuffix: false });
  } catch {
    ago = '—';
  }

  return (
    <div className="border-b border-border/50 px-2 py-1.5">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[9px] font-bold text-accent-green truncate">
          {post.account}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[8px] text-text-muted">{ago}</span>
          {post.url && (
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-muted hover:text-accent-green transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      </div>
      <p className="text-[10px] text-text-secondary leading-tight mt-0.5 line-clamp-2">
        {post.text}
      </p>
    </div>
  );
}

function countSources(posts: Array<{ account: string }>): number {
  return new Set(posts.map((p) => p.account)).size;
}
