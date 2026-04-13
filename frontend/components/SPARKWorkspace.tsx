"use client";

type Props = {
  rail: React.ReactNode;
  center: React.ReactNode;
  tray: React.ReactNode;
  footer?: React.ReactNode;
};

export function SPARKWorkspace({ rail, center, tray, footer }: Props) {
  return (
    <div className="w-full">
      <div className="mx-auto grid max-w-[1600px] gap-4 lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)_minmax(260px,320px)] lg:items-start">
        <div className="order-2 lg:order-1 lg:sticky lg:top-4">{rail}</div>
        <div className="order-1 min-w-0 lg:order-2">{center}</div>
        <div className="order-3 lg:sticky lg:top-4">{tray}</div>
      </div>
      {footer ? (
        <div className="mx-auto mt-8 max-w-[1600px] border-t border-slate-200 pt-6">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
