const cards = [
  ['Tracked Assets', '1,284', 'Across active infrastructure portfolios'],
  ['Verified Proofs', '18,943', 'Signed lifecycle records'],
  ['Passport Coverage', '97%', 'Assets with anchored provenance'],
  ['Pending Approvals', '5', 'QA / commissioning queue'],
];

export default function Home() {
  return (
    <main className="page">
      <section className="hero">
        <div>
          <div className="eyebrow">Infrastructure Trust Operating System</div>
          <h1>Know what exists. Know what happened. Prove it.</h1>
          <p>
            STRATUM Twin represents the infrastructure. STRATUM Verified captures its provenance,
            lifecycle, evidence, approvals and maintenance history. STRATUM Chain makes approved
            proof independently verifiable.
          </p>
          <div className="actions">
            <a className="primary" href="#passport">View asset passport</a>
            <a className="secondary" href="#chain">View chain status</a>
          </div>
        </div>
        <div className="network">
          <span className="pulse" />
          stratum-devnet-1 · network ready
        </div>
      </section>

      <section className="grid">
        {cards.map(([label, value, note]) => (
          <article className="card" key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
            <p>{note}</p>
          </article>
        ))}
      </section>

      <section id="passport" className="passport">
        <div className="passportHead">
          <div>
            <div className="eyebrow">STRATUM Verified Asset Passport</div>
            <h2>Main Switchgear SG-01</h2>
            <p>Schneider Electric · MasterPact MTZ2</p>
          </div>
          <span className="verified">✓ VERIFIED</span>
        </div>
        <div className="facts">
          <div><span>Asset ID</span><b>STR-AST-0009281</b></div>
          <div><span>Serial Number</span><b>SE-MTZ2-928193</b></div>
          <div><span>System</span><b>480V Distribution</b></div>
          <div><span>Location</span><b>Electrical Room 2A</b></div>
          <div><span>Status</span><b>Operational</b></div>
          <div><span>Latest Block</span><b>8,194,251</b></div>
        </div>
        <div className="timeline">
          {['Registered','Received','Installed','Inspected','Commissioned','Maintained'].map((x, i) => (
            <div className="stage" key={x}><i>{i < 5 ? '✓' : '●'}</i><span>{x}</span></div>
          ))}
        </div>
      </section>

      <section id="chain" className="chain">
        <div>
          <div className="eyebrow">Sovereign Verification Layer</div>
          <h2>STRATUM Chain</h2>
          <p>Three-validator development network with 2-of-3 quorum, cryptographic signatures, and independent verification.</p>
        </div>
        <div className="validators">
          {['Validator A','Validator B','Validator C'].map(v => <span key={v}>● {v}</span>)}
        </div>
      </section>
    </main>
  );
}
