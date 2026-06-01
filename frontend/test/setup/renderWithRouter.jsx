// ─────────────────────────────────────────────────────────────────────────────
//  renderWithRouter — render a page under a MemoryRouter (+ ThemeProvider).
//
//  Pages pull in two app-wide contexts the bare RTL render() can't satisfy:
//    • react-router  (useNavigate / <Link>)  — supplied by MemoryRouter.
//    • ThemeProvider (ThemeToggle's useTheme) — supplied here so the page's
//      header renders without throwing.
//
//  `routes` lets a test declare sibling destinations so a navigate() can be
//  asserted by the destination's content appearing (e.g. role-based redirect).
// ─────────────────────────────────────────────────────────────────────────────

import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { ThemeProvider } from '../../src/context/ThemeContext.jsx';

export function renderWithRouter(ui, { route = '/', routes = [] } = {}) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={route} element={ui} />
          {routes.map(({ path, element }) => (
            <Route key={path} path={path} element={element} />
          ))}
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}
