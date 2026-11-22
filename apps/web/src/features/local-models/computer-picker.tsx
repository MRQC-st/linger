import {
  ArrowDown01Icon,
  Cancel01Icon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/ui/icon";
import {
  selectPopupContainingBlock,
  selectPopupFrame,
} from "@/components/ui/select-popup-layout";
import { StatusDot } from "@/features/local-computer/computer-row";
import { useT } from "@/i18n/use-translation";
import { cn } from "@/lib/cn";

import { localModelsMessages as m } from "./local-models.messages";

/** Show search and status filtering once the Computer list exceeds ten items. */
export const COMPUTER_PICKER_SEARCH_THRESHOLD = 10;

const VIEWPORT_GUTTER_PX = 8;
const SEARCHABLE_POPUP_MAX_WIDTH_PX = 320;
const COMPACT_POPUP_MIN_WIDTH_PX = 200;

export interface ComputerPickerOption {
  readonly computerId: string;
  readonly displayName: string;
  readonly online: boolean;
}

export type ComputerStatusFilter = "all" | "online" | "offline";

interface PopupRect {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
}

interface PopupPlacement {
  readonly left: number;
  readonly side: "bottom" | "top";
  readonly top: number;
  readonly width: number;
}

/** Places online Computers before offline ones while keeping each group's order. */
export function orderComputerPickerOptions(
  options: readonly ComputerPickerOption[],
): ComputerPickerOption[] {
  const online: ComputerPickerOption[] = [];
  const offline: ComputerPickerOption[] = [];
  for (const option of options) {
    if (option.online) online.push(option);
    else offline.push(option);
  }
  return [...online, ...offline];
}

/** Filters ordered Computer options by connection status and search query. */
export function filterComputerPickerOptions(
  options: readonly ComputerPickerOption[],
  filter: {
    readonly query: string;
    readonly status: ComputerStatusFilter;
  },
): ComputerPickerOption[] {
  const normalizedQuery = filter.query.trim().toLocaleLowerCase();
  return options.filter((option) => {
    if (filter.status === "online" && !option.online) return false;
    if (filter.status === "offline" && option.online) return false;
    if (!normalizedQuery) return true;
    return (
      option.displayName.toLocaleLowerCase().includes(normalizedQuery) ||
      option.computerId.toLocaleLowerCase().includes(normalizedQuery)
    );
  });
}

/**
 * Anchors the popover cleanly under the header pill: right-aligned when the
 * trigger sits in the right half of the viewport, left-aligned otherwise, and
 * clamped within viewport gutters so narrow viewports never overflow.
 */
export function computerPickerPopupPosition(
  trigger: PopupRect,
  viewport: { readonly height: number; readonly width: number },
  input: {
    readonly menuHeight?: number;
    readonly searchable: boolean;
  },
): PopupPlacement {
  const maxWidth = Math.max(160, viewport.width - VIEWPORT_GUTTER_PX * 2);
  const width = input.searchable
    ? Math.min(SEARCHABLE_POPUP_MAX_WIDTH_PX, maxWidth)
    : Math.min(Math.max(trigger.width, COMPACT_POPUP_MIN_WIDTH_PX), maxWidth);
  const alignRight = trigger.left + trigger.width / 2 > viewport.width / 2;
  const preferredLeft = alignRight ? trigger.right - width : trigger.left;
  const maxLeft = Math.max(
    VIEWPORT_GUTTER_PX,
    viewport.width - width - VIEWPORT_GUTTER_PX,
  );
  const left = Math.min(Math.max(VIEWPORT_GUTTER_PX, preferredLeft), maxLeft);
  const below = trigger.bottom + 4;
  const height = input.menuHeight ?? 0;
  const fitsBelow =
    height === 0 || below + height <= viewport.height - VIEWPORT_GUTTER_PX;
  const side = fitsBelow ? "bottom" : "top";
  const top = fitsBelow
    ? below
    : Math.max(VIEWPORT_GUTTER_PX, trigger.top - height - 4);
  return { left, side, top, width };
}

/**
 * Compact header switcher for Settings › Models. Displays live connection dots
 * and online-first ordering for every fleet size, and progressively reveals
 * search plus All / Online / Offline filters once more than 10 Computers exist.
 */
export function ComputerPicker({
  onSelect,
  options,
  value,
}: {
  readonly onSelect: (computerId: string) => void;
  readonly options: readonly ComputerPickerOption[];
  readonly value: string;
}) {
  const t = useT();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);

  const orderedOptions = useMemo(
    () => orderComputerPickerOptions(options),
    [options],
  );
  const selected = orderedOptions.find((option) => option.computerId === value);
  const searchable = orderedOptions.length > COMPUTER_PICKER_SEARCH_THRESHOLD;
  const triggerLabel = selected
    ? selected.online
      ? selected.displayName
      : t(m.computerOffline, { name: selected.displayName })
    : "";

  function close(focusTrigger = false) {
    setOpen(false);
    if (focusTrigger) requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <>
      <button
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t(m.computerPicker)}
        className="select-pill min-w-0 max-w-56 text-left"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        ref={triggerRef}
        role="combobox"
        type="button"
        value={value}
      >
        {selected ? (
          <StatusDot tone={selected.online ? "success" : "neutral"} />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
        <Icon
          className={cn(
            "shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          icon={ArrowDown01Icon}
          size={14}
        />
      </button>
      {open ? (
        <ComputerPickerPopup
          listboxId={listboxId}
          onChoose={(computerId) => {
            onSelect(computerId);
            close(true);
          }}
          onClose={close}
          options={orderedOptions}
          searchable={searchable}
          triggerRef={triggerRef}
          value={value}
        />
      ) : null}
    </>
  );
}

function ComputerPickerPopup({
  listboxId,
  onChoose,
  onClose,
  options,
  searchable,
  triggerRef,
  value,
}: {
  readonly listboxId: string;
  readonly onChoose: (computerId: string) => void;
  readonly onClose: (focusTrigger?: boolean) => void;
  readonly options: readonly ComputerPickerOption[];
  readonly searchable: boolean;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  readonly value: string;
}) {
  const t = useT();
  const popupRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionNodesRef = useRef(new Map<string, HTMLButtonElement>());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComputerStatusFilter>("all");
  const [highlightedId, setHighlightedId] = useState<string | null>(value);
  const [placement, setPlacement] = useState<{
    readonly anchored: boolean;
    readonly left: number;
    readonly side: "bottom" | "top";
    readonly top: number;
    readonly width: number;
  }>({
    anchored: false,
    left: 0,
    side: "bottom",
    top: 0,
    width: 0,
  });

  const onlineCount = useMemo(
    () => options.filter((option) => option.online).length,
    [options],
  );
  const offlineCount = options.length - onlineCount;
  const filtered = useMemo(
    () =>
      searchable
        ? filterComputerPickerOptions(options, {
            query,
            status: statusFilter,
          })
        : [...options],
    [options, query, searchable, statusFilter],
  );

  const activeId = useMemo(() => {
    if (
      highlightedId &&
      filtered.some((item) => item.computerId === highlightedId)
    ) {
      return highlightedId;
    }
    if (filtered.some((item) => item.computerId === value)) return value;
    return filtered[0]?.computerId ?? null;
  }, [filtered, highlightedId, value]);

  const showGroups =
    searchable &&
    statusFilter === "all" &&
    filtered.some((item) => item.online) &&
    filtered.some((item) => !item.online);
  const onlineFiltered = showGroups
    ? filtered.filter((item) => item.online)
    : filtered;
  const offlineFiltered = showGroups
    ? filtered.filter((item) => !item.online)
    : [];

  const closePopup = useEffectEvent(onClose);
  const supportsPopover =
    typeof HTMLElement.prototype.showPopover === "function";

  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (supportsPopover) popup?.showPopover();

    function place() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const portalRoot = trigger.closest("dialog") ?? document.body;
      const origin = supportsPopover
        ? null
        : selectPopupContainingBlock(portalRoot);
      const frame = selectPopupFrame(trigger.getBoundingClientRect(), origin, {
        height: window.innerHeight,
        width: window.innerWidth,
      });
      const next = computerPickerPopupPosition(frame.trigger, frame.viewport, {
        menuHeight: popupRef.current?.offsetHeight,
        searchable,
      });
      setPlacement({
        anchored: Boolean(origin),
        ...next,
      });
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      if (supportsPopover) popup?.hidePopover();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [filtered.length, searchable, supportsPopover, triggerRef]);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      if (searchable) {
        searchInputRef.current?.focus({ preventScroll: true });
      } else {
        const targetId = options.some((item) => item.computerId === value)
          ? value
          : options[0]?.computerId;
        if (targetId) {
          optionNodesRef.current.get(targetId)?.focus({ preventScroll: true });
        }
      }
    });
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        !triggerRef.current?.contains(target) &&
        !popupRef.current?.contains(target)
      ) {
        closePopup();
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closePopup(true);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [options, searchable, triggerRef, value]);

  function moveActive(direction: 1 | -1) {
    if (filtered.length === 0) return;
    const currentIndex = filtered.findIndex(
      (item) => item.computerId === activeId,
    );
    const nextIndex =
      currentIndex < 0
        ? direction > 0
          ? 0
          : filtered.length - 1
        : (currentIndex + direction + filtered.length) % filtered.length;
    const nextItem = filtered[nextIndex];
    if (!nextItem) return;
    setHighlightedId(nextItem.computerId);
    const node = optionNodesRef.current.get(nextItem.computerId);
    if (!searchable) node?.focus();
    node?.scrollIntoView?.({ block: "nearest" });
  }

  function handleListboxKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab" && !searchable) {
      onClose();
      return;
    }
    if (!searchable && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter" && activeId) {
      event.preventDefault();
      onChoose(activeId);
    }
  }

  function resetFilters() {
    setQuery("");
    setStatusFilter("all");
    searchInputRef.current?.focus();
  }

  function optionDomId(computerId: string) {
    return `${listboxId}-opt-${computerId}`;
  }

  function renderOption(option: ComputerPickerOption) {
    const isSelected = option.computerId === value;
    const isActive = searchable && option.computerId === activeId;
    const accessibleName = option.online
      ? option.displayName
      : t(m.computerOffline, { name: option.displayName });

    return (
      <button
        aria-label={accessibleName}
        aria-selected={isSelected}
        className={cn(
          "dropdown-option justify-between gap-2",
          isActive && "bg-accent text-accent-foreground",
        )}
        id={optionDomId(option.computerId)}
        key={option.computerId}
        onClick={() => onChoose(option.computerId)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onChoose(option.computerId);
          }
        }}
        onMouseEnter={() => {
          if (searchable) setHighlightedId(option.computerId);
        }}
        ref={(node) => {
          if (node) optionNodesRef.current.set(option.computerId, node);
          else optionNodesRef.current.delete(option.computerId);
        }}
        role="option"
        tabIndex={-1}
        type="button"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <StatusDot tone={option.online ? "success" : "neutral"} />
          <span
            className={cn(
              "min-w-0 truncate",
              !option.online && "text-muted-foreground",
            )}
          >
            {option.displayName}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {!option.online ? (
            <span className="text-xs text-muted-foreground">
              {t(m.computerStatusOffline)}
            </span>
          ) : null}
          {isSelected ? (
            <Icon className="text-foreground" icon={Tick02Icon} size={14} />
          ) : null}
        </span>
      </button>
    );
  }

  const filterTabs: readonly {
    readonly count: number;
    readonly dot?: "neutral" | "success";
    readonly key: ComputerStatusFilter;
    readonly label: string;
  }[] = [
    { count: options.length, key: "all", label: t(m.computerFilterAll) },
    {
      count: onlineCount,
      dot: "success",
      key: "online",
      label: t(m.computerFilterOnline),
    },
    {
      count: offlineCount,
      dot: "neutral",
      key: "offline",
      label: t(m.computerFilterOffline),
    },
  ];

  const portalRoot = triggerRef.current?.closest("dialog") ?? document.body;

  return createPortal(
    <div
      className="dropdown-options z-[100] m-0 text-app-ink"
      data-computer-picker-popover=""
      data-select-portal=""
      data-side={placement.side}
      popover={supportsPopover ? "manual" : undefined}
      ref={popupRef}
      style={{
        inset: "auto",
        left: placement.left,
        position: placement.anchored ? "absolute" : "fixed",
        top: placement.top,
        ...(placement.width > 0
          ? searchable
            ? { width: placement.width }
            : { minWidth: placement.width }
          : {}),
      }}
    >
      {searchable ? (
        <div className="mb-1 flex flex-col gap-2 border-b border-border px-1 pt-1 pb-2">
          <div className="relative flex items-center">
            <Icon
              className="pointer-events-none absolute left-2.5 text-muted-foreground"
              icon={Search01Icon}
              size={14}
            />
            <input
              aria-activedescendant={
                activeId ? optionDomId(activeId) : undefined
              }
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-label={t(m.computerSearchLabel)}
              autoComplete="off"
              className="h-8 w-full rounded-md border border-border bg-background pr-7 pl-8 text-xs text-foreground outline-none transition-colors placeholder:text-app-placeholder hover:border-border-hover focus:border-[var(--app-border-interactive)] focus:ring-2 focus:ring-ring/35"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t(m.computerSearchPlaceholder)}
              ref={searchInputRef}
              role="searchbox"
              spellCheck={false}
              type="text"
              value={query}
            />
            {query ? (
              <button
                aria-label={t(m.computerSearchClear)}
                className="absolute right-1.5 flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
                type="button"
              >
                <Icon icon={Cancel01Icon} size={12} />
              </button>
            ) : null}
          </div>
          <div
            aria-label={t(m.computerStatusFilter)}
            className="grid grid-cols-3 gap-0.5 rounded-lg bg-muted p-0.5"
            role="group"
          >
            {filterTabs.map((item) => {
              const active = statusFilter === item.key;
              return (
                <button
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-7 items-center justify-center gap-1 rounded-md px-1.5 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                    active
                      ? "bg-background font-medium text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  key={item.key}
                  onClick={() => {
                    setStatusFilter(item.key);
                    searchInputRef.current?.focus();
                  }}
                  type="button"
                >
                  {item.dot ? <StatusDot tone={item.dot} /> : null}
                  <span className="truncate">{item.label}</span>
                  <span className="tabular-nums text-[11px] opacity-70">
                    {item.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div
        aria-label={t(m.computerPicker)}
        className="dropdown-options-list workspace-scrollbar"
        id={listboxId}
        onKeyDown={handleListboxKeyDown}
        role="listbox"
        tabIndex={-1}
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
            <p className="text-xs text-muted-foreground">
              {query.trim()
                ? t(m.computerEmptyQuery, { query: query.trim() })
                : statusFilter === "online"
                  ? t(m.computerEmptyOnline)
                  : t(m.computerEmptyOffline)}
            </p>
            {query.trim() || statusFilter !== "all" ? (
              <button
                className="rounded-md px-2 py-1 text-xs font-medium text-foreground underline underline-offset-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={resetFilters}
                type="button"
              >
                {t(m.computerClearFilters)}
              </button>
            ) : null}
          </div>
        ) : showGroups ? (
          <>
            <p
              className="px-2 pt-1 pb-1 text-[11px] font-medium text-muted-foreground"
              role="presentation"
            >
              {t(m.computerGroupOnline)}
            </p>
            {onlineFiltered.map(renderOption)}
            <p
              className="mt-1 border-t border-border px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground"
              role="presentation"
            >
              {t(m.computerGroupOffline)}
            </p>
            {offlineFiltered.map(renderOption)}
          </>
        ) : (
          filtered.map(renderOption)
        )}
      </div>
    </div>,
    portalRoot,
  );
}
