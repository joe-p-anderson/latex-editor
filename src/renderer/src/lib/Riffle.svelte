<script lang="ts">
  /**
   * The riffle when switching files in the Bench look: six paper leaves,
   * each turning for 170 ms, 38 ms apart, over the page. Moving to a later
   * tab turns them away; moving to an earlier one brings them in. Skipped
   * under prefers-reduced-motion.
   */
  let { run }: { run: { n: number; forward: boolean } | null } = $props()

  const LEAVES = 6
  let playing = $state<{ n: number; forward: boolean } | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  $effect(() => {
    if (!run || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    playing = { ...run }
    clearTimeout(timer)
    timer = setTimeout(() => (playing = null), 170 + 38 * (LEAVES - 1) + 40)
  })
</script>

{#if playing}
  {#key playing.n}
    <div class="riffle" aria-hidden="true">
      {#each { length: LEAVES } as _, i (i)}
        <div class="leaf" class:in={!playing.forward} style:animation-delay="{i * 38}ms"></div>
      {/each}
    </div>
  {/key}
{/if}

<style>
  .riffle {
    position: absolute;
    z-index: 15;
    top: 44px;
    bottom: 0;
    left: calc(var(--book-x) + var(--board-l));
    width: var(--leaf-w);
    perspective: 1800px;
    perspective-origin: 0% 50%;
    pointer-events: none;
    overflow: visible;
  }
  .leaf {
    position: absolute;
    inset: 0;
    transform-origin: 0 50%;
    backface-visibility: hidden;
    background-color: var(--paper);
    background-image: repeating-linear-gradient(transparent 0 17px, color-mix(in srgb, var(--ink) 7%, transparent) 17px 25px);
    background-size: calc(100% - 150px) calc(100% - 140px);
    background-position: 60px 60px;
    background-repeat: no-repeat;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08), -2px 0 6px rgba(0, 0, 0, 0.12);
    transform: rotateY(-100deg);
    animation: away 170ms ease-in both;
  }
  .leaf.in {
    animation-name: back;
    animation-timing-function: ease-out;
  }
  @keyframes away {
    from {
      transform: rotateY(0deg);
    }
    to {
      transform: rotateY(-100deg);
    }
  }
  @keyframes back {
    from {
      transform: rotateY(-100deg);
    }
    to {
      transform: rotateY(0deg);
      opacity: 0;
    }
  }
</style>
