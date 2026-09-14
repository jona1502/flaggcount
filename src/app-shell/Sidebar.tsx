import { Button, IconButton, IconFlag, IconLogout, IconSidebar, cx } from '../components/ui';
import { PAGES, type Navigate, type PageId } from './navigation';

type SidebarProps = {
  pages: readonly PageId[];
  current: PageId;
  onNavigate: Navigate;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Short, decorative hints next to entries, e.g. the plan on "Lizenz & Konto". */
  badges?: Partial<Record<PageId, string>>;
  onLogout?: () => void;
};

export function Sidebar({ pages, current, onNavigate, collapsed, onToggleCollapsed, badges = {}, onLogout }: SidebarProps): React.JSX.Element {
  return (
    <aside className="shell-sidebar" data-collapsed={collapsed}>
      <div className="shell-brand">
        <span className="shell-brand-mark" aria-hidden="true">
          <IconFlag size={18} />
        </span>
        <span className="shell-brand-name">FlagCount</span>
      </div>

      <nav aria-label="Hauptnavigation" className="shell-nav">
        <ul>
          {pages.map((id) => {
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
      </nav>

      <div className="shell-sidebar-footer">
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
