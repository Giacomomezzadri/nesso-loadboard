import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { AlertsPage } from './pages/AlertsPage'
import { AdminPage } from './pages/AdminPage'
import { ComparePage } from './pages/ComparePage'
import { DataQualityPage } from './pages/DataQualityPage'
import { DrillsPage } from './pages/DrillsPage'
import { DynamicLoadPage } from './pages/DynamicLoadPage'
import { GameVGamePage } from './pages/GameVGamePage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { OverviewPage } from './pages/OverviewPage'
import { PlayerProfilePage } from './pages/PlayerProfilePage'
import { ReportPage } from './pages/ReportPage'
import { RosterPage } from './pages/RosterPage'
import { SessionsPage } from './pages/SessionsPage'
import { SessionVGamePage } from './pages/SessionVGamePage'
import { SessionVSessionPage } from './pages/SessionVSessionPage'
import { SettingsPage } from './pages/SettingsPage'
import { useAuth } from './state/AuthContext'

export function App() {
  const { user, isLoading, isAdmin } = useAuth()

  // The auth cookie already gates every request server-side — this is just
  // "don't flash the wrong screen" while /api/auth/me resolves.
  if (isLoading || !user) return null

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/dynamic-load" element={<DynamicLoadPage />} />
        <Route path="/session-v-game" element={<SessionVGamePage />} />
        <Route path="/session-v-session" element={<SessionVSessionPage />} />
        <Route path="/game-v-game" element={<GameVGamePage />} />
        <Route path="/drills" element={<DrillsPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/players" element={<PlayerProfilePage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/quality" element={<DataQualityPage />} />
        <Route path="/roster" element={<RosterPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      {/* An Admin is a superuser: every data page above, plus the account
          registry — which keeps its own full-page chrome, so it sits outside
          AppLayout rather than nested in it. Non-admins are bounced, and
          _middleware.ts refuses /api/admin/* for them regardless. */}
      <Route path="/admin" element={isAdmin ? <AdminPage /> : <Navigate to="/" replace />} />
    </Routes>
  )
}
