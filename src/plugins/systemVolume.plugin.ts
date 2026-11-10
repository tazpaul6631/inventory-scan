import { registerPlugin } from '@capacitor/core'

export interface MediaVolumeState {
  current: number
  max: number
  percent: number
}

export interface SetMediaVolumeOptions {
  percent: number
}

export interface SystemVolumePlugin {
  getMediaVolume(): Promise<MediaVolumeState>
  setMediaVolume(options: SetMediaVolumeOptions): Promise<MediaVolumeState>
}

export const SystemVolume = registerPlugin<SystemVolumePlugin>('SystemVolume')
