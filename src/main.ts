import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import App from './App.vue'
import router from './router'
import { i18n } from '@/i18n'
import { applyNativeChrome } from '@/adapters/platform'
import { installExternalWebLinkGuard } from '@/adapters/externalWeb'
import 'primeicons/primeicons.css'
import './styles/app.css'

void applyNativeChrome()
void installExternalWebLinkGuard()

const app = createApp(App)

app.use(createPinia())
app.use(i18n)
app.use(router)
app.use(PrimeVue, {
  ripple: false,
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.app-dark',
    },
  },
})
app.use(ToastService)
app.use(ConfirmationService)
app.mount('#app')
