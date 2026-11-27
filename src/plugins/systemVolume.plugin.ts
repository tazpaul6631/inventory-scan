import { registerPlugin } from '@capacitor/core'

interface MediaVolumeState {
  current: number
  max: number
  percent: number
}

interface SetMediaVolumeOptions {
  percent: number
}

interface SystemVolumePlugin {
  getMediaVolume(): Promise<MediaVolumeState>
  setMediaVolume(options: SetMediaVolumeOptions): Promise<MediaVolumeState>
}

export const SystemVolume = registerPlugin<SystemVolumePlugin>('SystemVolume')
