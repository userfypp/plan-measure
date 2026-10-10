import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "../../components/ui";
import {
  filterPages,
  PAGE_OVERSCAN,
  PAGE_ROW_HEIGHT,
  pageBrowserLabel,
  pageWindow,
  parsePhysicalPage,
} from "./pageBrowserModel";
import { MAX_THUMBNAIL_WINDOW, ThumbnailQueue } from "./thumbnailQueue";
import styles from "./PageBrowser.module.css";

interface PageBrowserProps {
  document: PDFDocumentProxy;
  labels: readonly string[] | null;
  /** Source PDF size, used to pause previews that would need an expensive decode. */
  fileBytes?: number;
  currentPage: number;
  navigationDisabled: boolean;
  onNavigate: (number: number) => void;
  onClose: () => void;
}
// Keep even an unusually tall viewport's visible rows and margin inside both cache limits.
const MAX_LIST_HEIGHT = (MAX_THUMBNAIL_WINDOW - PAGE_OVERSCAN * 2 - 1) * PAGE_ROW_HEIGHT;
function CloseIcon() {
  return (
    <svg className={styles.closeIcon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  );
}
function Thumbnail({ number, source }: { number: number; source?: HTMLCanvasElement }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext("2d", { alpha: false })?.drawImage(source, 0, 0);
    return () => {
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [source]);
  return (
    <span className={styles.thumbnail}>
      {source ? (
        <canvas ref={canvasRef} aria-label={`Thumbnail for page ${number}`} />
      ) : (
        <span>{number}</span>
      )}
    </span>
  );
}
export function PageBrowser({
  document,
  labels,
  fileBytes = 0,
  currentPage,
  navigationDisabled,
  onNavigate,
  onClose,
}: PageBrowserProps) {
  const [search, setSearch] = useState("");
  const [goToDraft, setGoToDraft] = useState({ page: currentPage, value: String(currentPage) });
  const goTo = goToDraft.page === currentPage ? goToDraft.value : String(currentPage);
  const [goError, setGoError] = useState(false);
  const [activeNumber, setActiveNumber] = useState(currentPage);
  const [geometry, setGeometry] = useState({
    top: Math.max(0, (currentPage - 1) * PAGE_ROW_HEIGHT),
    height: 320,
  });
  const [previews, setPreviews] = useState({
    thumbnails: new Map<number, HTMLCanvasElement>(),
    deferred: false,
  });
  const thumbnails = previews.thumbnails;
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const queueRef = useRef<ThumbnailQueue | null>(null);
  const wantedRef = useRef<number[]>([]);
  const id = useId();
  const pages = useMemo(
    () => filterPages(document.numPages, labels, search),
    [document.numPages, labels, search],
  );
  const range = pageWindow(pages.length, geometry.top, geometry.height);
  const mountedPages = useMemo(
    () => pages.slice(range.start, range.end),
    [pages, range.start, range.end],
  );
  const focusedNumber = pages.includes(activeNumber) ? activeNumber : (pages[0] ?? null);
  const prioritizedPages = useMemo(
    () => [
      ...pages.slice(range.first, range.last),
      ...mountedPages.filter((number) => !pages.slice(range.first, range.last).includes(number)),
    ],
    [mountedPages, pages, range.first, range.last],
  );

  useEffect(() => {
    let live = true;
    const queue = new ThumbnailQueue(
      document,
      () => {
        if (!live) return;
        const next = new Map<number, HTMLCanvasElement>();
        for (const number of wantedRef.current) {
          const canvas = queue.get(number);
          if (canvas) next.set(number, canvas);
        }
        setPreviews({ thumbnails: next, deferred: queue.deferred });
      },
      fileBytes,
    );
    queueRef.current = queue;
    return () => {
      live = false;
      queue.dispose();
      queueRef.current = null;
    };
  }, [document, fileBytes]);
  useEffect(() => {
    wantedRef.current = prioritizedPages;
    queueRef.current?.setWindow(prioritizedPages);
  }, [prioritizedPages]);

  const reveal = useCallback((index: number) => {
    const list = listRef.current;
    if (!list || index < 0) return;
    const top = index * PAGE_ROW_HEIGHT;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + PAGE_ROW_HEIGHT > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, top + PAGE_ROW_HEIGHT - list.clientHeight);
    }
    setGeometry({ top: list.scrollTop, height: list.clientHeight || 320 });
  }, []);
  useLayoutEffect(() => {
    reveal(pages.indexOf(currentPage));
  }, [currentPage, pages, reveal]);
  const empty = pages.length === 0;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => setGeometry({ top: list.scrollTop, height: list.clientHeight || 320 });
    const observer = new ResizeObserver(update);
    observer.observe(list);
    update();
    return () => observer.disconnect();
  }, [empty]);
  useEffect(() => {
    searchRef.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (window.innerWidth > 800 || !(event.target instanceof Node)) return;
      if (
        panelRef.current?.contains(event.target) ||
        (event.target instanceof Element && event.target.closest('[aria-controls="page-browser"]'))
      )
        return;
      onClose();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        (event.target instanceof Element &&
          event.target.closest("dialog, [role='dialog'], [role='menu']")) ||
        window.document.querySelector("dialog[open], [role='dialog']")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      window.document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, [onClose]);

  function navigate(number: number) {
    if (navigationDisabled) return;
    if (number !== currentPage) onNavigate(number);
    if (window.innerWidth <= 800) onClose();
  }
  function listKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.metaKey || event.ctrlKey || event.nativeEvent.isComposing) return;
    const index = focusedNumber === null ? -1 : pages.indexOf(focusedNumber);
    let next: number;
    if (event.key === "ArrowDown" || event.key === "ArrowRight")
      next = Math.min(pages.length - 1, index + 1);
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = pages.length - 1;
    else if (event.key === "Enter") {
      event.preventDefault();
      if (focusedNumber !== null) navigate(focusedNumber);
      return;
    } else return;
    event.preventDefault();
    const number = pages[next];
    if (number !== undefined) {
      setActiveNumber(number);
      reveal(next);
    }
  }
  const activeMounted = focusedNumber !== null && mountedPages.includes(focusedNumber);
  return (
    <aside
      ref={panelRef}
      id="page-browser"
      aria-label="Pages"
      className={styles.panel}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          onClose();
        }
      }}
      onKeyUp={(event) => event.stopPropagation()}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2>Pages</h2>
        </div>
        <Button
          variant="ghost"
          size="compact"
          className={styles.iconButton}
          aria-label="Close pages"
          onClick={onClose}
        >
          <CloseIcon />
        </Button>
      </header>
      <div className={styles.controls}>
        <div className={styles.search}>
          <input
            ref={searchRef}
            type="search"
            aria-label="Search labels"
            placeholder="Search labels"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              if (listRef.current) listRef.current.scrollTop = 0;
              setGeometry((current) => ({ ...current, top: 0 }));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing && pages.length === 1) {
                event.preventDefault();
                navigate(pages[0]!);
              }
            }}
          />
          {search && (
            <Button
              variant="ghost"
              size="compact"
              className={`${styles.iconButton} ${styles.clearSearch}`}
              aria-label="Clear search"
              onClick={() => {
                setSearch("");
                searchRef.current?.focus();
              }}
            >
              <CloseIcon />
            </Button>
          )}
        </div>
        <form
          className={styles.goTo}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const number = parsePhysicalPage(goTo, document.numPages);
            setGoError(number === null);
            if (number !== null) navigate(number);
          }}
        >
          <label htmlFor={`${id}-number`}>Go to page</label>
          <div className={styles.numberField} data-invalid={goError || undefined}>
            <input
              id={`${id}-number`}
              type="number"
              min={1}
              max={document.numPages}
              step={1}
              value={goTo}
              aria-invalid={goError || undefined}
              aria-describedby={goError ? `${id}-error` : undefined}
              onChange={(event) => {
                setGoToDraft({ page: currentPage, value: event.target.value });
                setGoError(false);
              }}
            />
            <span>of {document.numPages}</span>
          </div>
        </form>
        {goError && (
          <span id={`${id}-error`} role="alert">
            Enter a page from 1 to {document.numPages}.
          </span>
        )}
        {navigationDisabled && (
          <span className={styles.notice}>
            Finish or cancel the current drawing or scale workflow before changing pages.
          </span>
        )}
        {previews.deferred && (
          <div className={styles.previewNotice}>
            <span id={`${id}-previews`}>Previews are paused to save memory on this PDF.</span>
            <Button
              variant="secondary"
              size="compact"
              aria-describedby={`${id}-previews`}
              onClick={() => {
                queueRef.current?.loadDeferred();
                // The button disappears once loading starts; keep focus inside the panel.
                (listRef.current ?? searchRef.current)?.focus({ preventScroll: true });
              }}
            >
              Load previews
            </Button>
          </div>
        )}
        <span role="status" aria-live="polite" aria-atomic="true" className={styles.srOnly}>
          {pages.length} {pages.length === 1 ? "page matches" : "pages match"}
        </span>
      </div>
      {pages.length === 0 ? (
        <div className={styles.empty}>
          <p>No pages match</p>
          <Button
            variant="secondary"
            onClick={() => {
              setSearch("");
              searchRef.current?.focus();
            }}
          >
            Clear search
          </Button>
        </div>
      ) : (
        <div
          ref={listRef}
          className={styles.list}
          style={{ maxHeight: MAX_LIST_HEIGHT }}
          role="listbox"
          aria-label="Pages list"
          tabIndex={0}
          aria-activedescendant={activeMounted ? `${id}-page-${focusedNumber}` : undefined}
          onFocus={() => {
            if (focusedNumber !== null) reveal(pages.indexOf(focusedNumber));
          }}
          onKeyDown={listKey}
          onScroll={(event) =>
            setGeometry({
              top: event.currentTarget.scrollTop,
              height: event.currentTarget.clientHeight || 320,
            })
          }
        >
          <div style={{ height: pages.length * PAGE_ROW_HEIGHT, position: "relative" }}>
            {mountedPages.map((number, index) => {
              const label = pageBrowserLabel(number, labels);
              const distinct = label !== String(number);
              return (
                <div
                  key={number}
                  id={`${id}-page-${number}`}
                  role="option"
                  aria-selected={number === focusedNumber}
                  aria-current={number === currentPage ? "page" : undefined}
                  aria-disabled={navigationDisabled || undefined}
                  aria-label={`${distinct ? `${label}, ` : ""}Page ${number}${number === currentPage ? ", current page" : ""}`}
                  aria-posinset={range.start + index + 1}
                  aria-setsize={pages.length}
                  data-page-number={number}
                  data-active={number === focusedNumber}
                  className={styles.row}
                  style={{ height: PAGE_ROW_HEIGHT, top: (range.start + index) * PAGE_ROW_HEIGHT }}
                  onClick={() => {
                    setActiveNumber(number);
                    listRef.current?.focus({ preventScroll: true });
                    navigate(number);
                  }}
                >
                  <Thumbnail number={number} source={thumbnails.get(number)} />
                  <span className={styles.label} title={label}>
                    {distinct ? label : `Page ${number}`}
                  </span>
                  <span className={styles.meta}>
                    {distinct ? `Page ${number}` : ""}
                    {number === currentPage ? `${distinct ? " · " : ""}Current page` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
