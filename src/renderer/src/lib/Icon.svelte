<script lang="ts">
  import { ICONS, type IconName } from './icons'

  /** `name` is one of icons.ts, or (for a plugin's own icon) the inner markup of a 24×24 stroked SVG. */
  let { name, size = 18 }: { name: IconName | (string & {}); size?: number } = $props()
  const markup = $derived(Object.hasOwn(ICONS, name) ? ICONS[name as IconName] : name)
</script>

<svg class="ic" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{@html markup}</svg>

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
