import { BrandLogo, Button, IconButton, IconLogout, IconSidebar, cx } from '../components/ui';
import { NAV_GROUPS, PAGES, type Navigate, type PageId } from './navigation';

type SidebarProps = {
  pages: readonly PageId[];
  current: PageId;
  onNavigate: Navigate;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Short, decorative hints next to entries, e.g. the plan on "Pro & Lizenz". */
  badges?: Partial<Record<PageId, string>>;
  /** Marks the cockpit while a stream is connected. */
  live?: boolean;
  version?: string | null;
  onLogout?: () => void;
};

export function Sidebar({
  pages,
  current,
  onNavigate,
  collapsed,
  onToggleCollapsed,
  badges = {},
  live = false,
  version,
  onLogout
}: SidebarProps): React.JSX.Element {
  const groups = NAV_GROUPS.map((group) => ({ ...group, pages: group.pages.filter((id) => pages.includes(id)) })).filter(
    (group) => group.pages.length > 0
  );

  return (
    <aside className="shell-sidebar" data-collapsed={collapsed}>
      <div className="shell-brand">
        <BrandLogo size="md" className="shell-brand-mark" />
        <span className="shell-brand-name">Audience Live</span>
      </div>

      <nav aria-label="Hauptnavigation" className="shell-nav">
        {groups.map((group) => (
          <div key={group.id} className="shell-nav-group">
            <p id={`shell-nav-${group.id}`} className="shell-nav-group-label">
              {group.label}
            </p>
            <ul aria-labelledby={`shell-nav-${group.id}`}>
              {group.pages.map((id) => {
                const { label, icon: Icon } = PAGES[id];
                const active = id === current;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className={cx('shell-nav-item', active && 'is-active')}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? label : undefined}
                      onClick={() => onNavigate({ page: id })}
                    >
                      <Icon size={18} />
                      <span className="shell-nav-label">{label}</span>
                      {id === 'live' && live && <span className="shell-nav-live" aria-hidden="true" />}
                      {badges[id] && (
                        <span className="shell-nav-badge" aria-hidden="true">
                          {badges[id]}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shell-sidebar-footer">
        {version && <span className="shell-version">Version {version}</span>}
        {onLogout && (
          <Button variant="ghost" size="sm" icon={IconLogout} onClick={onLogout} className="shell-logout">
            Abmelden
          </Button>
        )}
        <IconButton
          label={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
          icon={IconSidebar}
          size="sm"
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
          className="shell-collapse"
        />
      </div>
    </aside>
  );
}
