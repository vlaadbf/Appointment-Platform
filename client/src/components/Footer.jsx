export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="app-footer floating">
      <div className="inner">
        <p>
          &copy; {year} Aplicație realizată de{" "}
          <a
            href="https://clickgrowthlab.ro"
            target="_blank"
            rel="noopener noreferrer"
          >
            clickgrowthlab.ro
          </a>
        </p>
   
      </div>
    </footer>
  );
}
