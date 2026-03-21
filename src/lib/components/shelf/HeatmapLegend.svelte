<div class="legend">
	<span class="legend-label">Played recently</span>
	<div class="gradient-bar"></div>
	<span class="legend-label">Never / 5+ years</span>
</div>
<div class="legend-ticks">
	<span>Today</span>
	<span>6 mo</span>
	<span>1 yr</span>
	<span>3 yr</span>
	<span>5+ yr</span>
</div>

<style>
	.legend {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: #666;
	}
	.gradient-bar {
		flex: 1;
		height: 12px;
		border-radius: 6px;
		background: linear-gradient(
			to right,
			hsl(120, 80%, 55%),
			hsl(80, 80%, 55%),
			hsl(50, 80%, 55%),
			hsl(25, 80%, 55%),
			hsl(0, 80%, 55%)
		);
	}
	.legend-ticks {
		display: flex;
		justify-content: space-between;
		font-size: 0.65rem;
		color: #999;
		padding: 0 3.5rem;
	}
</style>
