import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import Login from './Login.jsx';
import { server } from '../../test/setup/mswServer.js';
import { renderWithRouter } from '../../test/setup/renderWithRouter.jsx';
import { getStoredToken, getStoredUser } from '../../test/setup/localStorageAuth.js';

const LOGIN_URL = '/api/v1/user/login';

// Render Login at '/' with sibling destinations so a role-based redirect can be
// asserted by the destination's content appearing.
function renderLogin() {
  return renderWithRouter(<Login />, {
    route: '/',
    routes: [
      { path: '/dashboard', element: <div>DASHBOARD SCREEN</div> },
      { path: '/invigilator-portal', element: <div>PORTAL SCREEN</div> },
    ],
  });
}

async function fillAndSubmit(email, password) {
  await userEvent.type(screen.getByLabelText('Email address'), email);
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('<Login>', () => {
  it('stores token + user and redirects an admin to /dashboard', async () => {
    server.use(
      http.post(LOGIN_URL, () =>
        HttpResponse.json({
          token: 'jwt-admin',
          user: { id: 7, name: 'Ada Admin', email: 'ada@lnmiit.ac.in', role: 'admin' },
        }),
      ),
    );

    renderLogin();
    await fillAndSubmit('ada@lnmiit.ac.in', 'secret123');

    await waitFor(() => expect(screen.getByText('DASHBOARD SCREEN')).toBeInTheDocument());
    expect(getStoredToken()).toBe('jwt-admin');
    expect(getStoredUser()).toEqual({
      id: 7, name: 'Ada Admin', email: 'ada@lnmiit.ac.in', role: 'admin',
    });
  });

  it('redirects a non-admin (faculty) to /invigilator-portal', async () => {
    server.use(
      http.post(LOGIN_URL, () =>
        HttpResponse.json({
          token: 'jwt-fac',
          user: { id: 9, name: 'Fred Faculty', email: 'fred@lnmiit.ac.in', role: 'faculty' },
        }),
      ),
    );

    renderLogin();
    await fillAndSubmit('fred@lnmiit.ac.in', 'secret123');

    await waitFor(() => expect(screen.getByText('PORTAL SCREEN')).toBeInTheDocument());
    expect(getStoredUser().role).toBe('faculty');
  });

  it('renders the server error in a role="alert" on a 401 and stores nothing', async () => {
    server.use(
      http.post(LOGIN_URL, () =>
        HttpResponse.json({ message: 'Invalid email or password.' }, { status: 401 }),
      ),
    );

    renderLogin();
    await fillAndSubmit('nobody@lnmiit.ac.in', 'wrongpass');

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    // Still on the login screen — no redirect happened.
    expect(screen.queryByText('DASHBOARD SCREEN')).not.toBeInTheDocument();
    // The 401 interceptor must have left no half-written session behind.
    expect(getStoredToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
  });

  it('validates locally (both fields required) without hitting the network', async () => {
    // No handler registered → if a request fired, onUnhandledRequest:'error' fails it.
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/enter both email and password/i);
  });
});
