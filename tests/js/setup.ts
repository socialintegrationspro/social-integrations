import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// The page config that Admin/Assets.php prints. The site is at UTC+6, with no summer time,
// so the tests see a difference between site time and UTC.
window.sintConfig = {
  restUrl: '/wp-json/sint/v1/',
  nonce: 'test-nonce',
  pageUrl: '/wp-admin/admin.php?page=social-integrations',
  timezone: 'Asia/Dhaka',
  gmtOffset: 6,
  weekStart: 1,
  redirectUri: '',
  oauthError: '',
  user: { name: 'Admin', caps: { sint_view: true, sint_share: true } },
  ai: { ready: false },
}

afterEach(() => {
  cleanup()
  window.location.hash = ''
})
