<script lang="ts">
  import { ICONS, type IconName } from './icons'

  let { name, size = 18 }: { name: IconName; size?: number } = $props()
</script>

<svg class="ic" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{@html ICONS[name]}</svg>

<style>
  .ic {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex: none;
    display: block;
  }
</style>
