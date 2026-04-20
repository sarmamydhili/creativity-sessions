"use client";

type Props = {
  rail: React.ReactNode;
  center: React.ReactNode;
  tray?: React.ReactNode | null;
  footer?: React.ReactNode;
  railCollapsed?: boolean;
};

export function SPARKWorkspace({
  rail,
  center,
  tray,
  footer,
  railCollapsed = false,
}: Props) {
  const hasTray = Boolean(tray);
  return (
    <div className="w-full">
      <div
        className={
          "mx-auto grid max-w-[1600px] gap-4 lg:items-start " +
          (hasTray
            ? railCollapsed
              ? "lg:grid-cols-[56px_minmax(0,1fr)_minmax(260px,320px)]"
              : "lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)_minmax(260px,320px)]"
            : railCollapsed
              ? "lg:grid-cols-[56px_minmax(0,1fr)]"
              : "lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]")
        }
      >
        <div className="order-2 lg:order-1 lg:sticky lg:top-4">{rail}</div>
        <div className="order-1 min-w-0 lg:order-2">{center}</div>
        {hasTray ? <div className="order-3 lg:sticky lg:top-4">{tray}</div> : null}
      </div>
      {footer ? (
        <div className="mx-auto mt-8 max-w-[1600px] border-t border-slate-200 pt-6">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
