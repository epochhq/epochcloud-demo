<script lang="ts">
	import ProofTable from '#lib/components/ProofTable.svelte';
	import StatusRow from '#lib/components/StatusRow.svelte';
</script>

<div class="card">
	<div class="card-head">
		<h3>Linkerd</h3>
		<span class="card-tag">Service Mesh</span>
	</div>
	<StatusRow id="linkerd" />
	<p class="card-desc">
		The sidecar proxies count the requests they serve and the identity that made them. Traefik reaching this app over mTLS shows here as requests from its
		workload identity.
	</p>
	<ProofTable group="linkerd" />
</div>
