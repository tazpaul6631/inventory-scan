import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import { useAuthStore } from '@/stores/auth'
import { homePathForShell, pathMatchesShell } from '@/adapters/platform'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: AppLayout,
      children: [
        { path: '', redirect: { name: 'login' } },
        { path: 'web', redirect: { name: 'web-users' } },
        { path: 'web/users', name: 'web-users', component: () => import('@/views/web/UsersPage.vue') },
        {
          path: 'app/mobile',
          component: () => import('@/views/app/mobile/MobileShell.vue'),
          children: [
            { path: '', name: 'app-mobile', redirect: { name: 'mobile-scan' } },
            { path: 'scan', name: 'mobile-scan', component: () => import('@/views/app/mobile/ScanPage.vue') },
            {
              path: 'history',
              name: 'mobile-history',
              component: () => import('@/views/app/mobile/HistoryPage.vue'),
            },
          ],
        },
      ],
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/PageNotFound.vue'), meta: { public: true } },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!auth.loaded) return true
  if (auth.unauthorized) {
    return to.name !== 'login'
  }
  if (to.meta.public) {
    if (auth.isLoggedIn && to.name === 'login') return homePathForShell()
    return true
  }
  if (!auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (!pathMatchesShell(to.path)) return homePathForShell()
  return true
})

export default router
