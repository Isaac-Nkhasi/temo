import { Icon } from "./Icon";

export function Header({
  onNotify, canGoBack, onBack, initials, hasAlerts,
}: {
  onNotify: () => void; canGoBack: boolean; onBack: () => void; initials: string; hasAlerts: boolean;
}) {
  return (
    <header className="topbar">
      <div className="topbar-leading">
        {canGoBack && (
          <button className="back-button" onClick={onBack} aria-label="Go back">
            <Icon name="back" size={22} />
          </button>
        )}
        <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <span className="brand-mark"><Icon name="sprout" size={21} /></span>
          <span>Temo</span>
        </button>
      </div>
      <div className="top-actions">
        <span className="language">EN <Icon name="chevron" size={14} /></span>
        <button className="icon-button notification" onClick={onNotify} aria-label="Notifications">
          <Icon name="bell" size={21} />
          {hasAlerts && <span />}
        </button>
        <div className="avatar avatar-small">{initials}</div>
      </div>
    </header>
  );
}
