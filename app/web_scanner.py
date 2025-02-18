import requests
import socket
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

def fetch_website_metadata(ip, port, parent_id=None, extra_data=None):
    """Fetch metadata and headers from a website hosted on the given IP and port.
    Optionally, attach a parent_id to extra_data without overwriting existing keys.
    """
    url = f"http://{ip}:{port}" if port != 443 else f"https://{ip}"
    try:
        response = requests.get(url, timeout=5, headers={"User-Agent": "Mozilla/5.0"})
        response.raise_for_status()

        headers = response.headers
        metadata = {
            "ip": ip,
            "port": port,
            "url": url,
            "status_code": response.status_code,
            "content_type": headers.get("Content-Type", "Unknown"),
            "server": headers.get("Server", "Unknown"),
            "title": "Unknown",
            "description": "Unknown",
            "security": "HTTPS" if url.startswith("https") else "HTTP"
        }

        # Parse the HTML if it's a webpage
        if "text/html" in metadata["content_type"]:
            soup = BeautifulSoup(response.text, "html.parser")
            title_tag = soup.find("title")
            description_tag = soup.find("meta", attrs={"name": "description"})
            if title_tag:
                metadata["title"] = title_tag.text.strip()
            if description_tag and "content" in description_tag.attrs:
                metadata["description"] = description_tag["content"].strip()

        # Merge extra_data and attach parent_id without overwriting existing keys
        if extra_data is None:
            extra_data = {}
        if parent_id is not None:
            extra_data.setdefault("parentId", parent_id)
        metadata["extra_data"] = extra_data

        return metadata
    except requests.RequestException as e:
        return {"error": str(e)}

def resolve_domain_to_ip(domain):
    """Resolve a domain to its corresponding IP address."""
    try:
        return socket.gethostbyname(domain)
    except socket.gaierror:
        return "Unresolved"

def extract_hyperlinks(ip, port):
    """Extracts all hyperlinks from a webpage hosted on the given IP and port."""
    url = f"http://{ip}:{port}" if port != 443 else f"https://{ip}"
    try:
        response = requests.get(url, timeout=5, headers={"User-Agent": "Mozilla/5.0"})
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        links = []
        parsed_url = urlparse(url)

        for a_tag in soup.find_all("a", href=True):
            link = urljoin(url, a_tag["href"])
            if link.startswith("http") and not link.startswith("javascript"):
                link_parsed = urlparse(link)
                if link_parsed.netloc != parsed_url.netloc:
                    resolved_ip = resolve_domain_to_ip(link_parsed.netloc)
                    links.append({"url": link, "type": "external", "resolved_ip": resolved_ip})
                else:
                    links.append({"url": link, "type": "internal"})

        return {"ip": ip, "port": port, "links": links}  # Structured output
    except requests.RequestException as e:
        return {"error": str(e)}

if __name__ == "__main__":
    test_ip = input("Enter an IP to scan: ")
    test_port = input("Enter a port: ")
    
    try:
        test_port = int(test_port)
    except ValueError:
        print("Invalid port number.")
        exit()
    
    print("\n🔍 Fetching Website Metadata...")
    metadata = fetch_website_metadata(test_ip, test_port)
    print(metadata)
    
    print("\n🌐 Extracting Hyperlinks and Resolving IPs...")
    links = extract_hyperlinks(test_ip, test_port)
    print(links)
