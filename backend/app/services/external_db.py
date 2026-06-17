import xml.etree.ElementTree as ET
import urllib.request
import urllib.parse
import json

from app.schemas.system import GenomeSearchResult


def search_ncbi_genomes(query: str, limit: int = 10) -> list[GenomeSearchResult]:
    if not query.strip():
        return []
    
    # We will search the nucleotide database since it allows fetching sequences via efetch
    # but we can filter by RefSeq to get reference sequences.
    search_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    search_params = {
        "db": "nuccore",
        "term": f"{query} AND srcdb_refseq[PROP]",
        "retmax": str(limit),
        "retmode": "json"
    }
    
    query_string = urllib.parse.urlencode(search_params)
    try:
        with urllib.request.urlopen(f"{search_url}?{query_string}") as response:
            search_data = json.loads(response.read().decode("utf-8"))
    except Exception:
        return []
    
    id_list = search_data.get("esearchresult", {}).get("idlist", [])
    if not id_list:
        return []
        
    summary_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
    summary_params = {
        "db": "nuccore",
        "id": ",".join(id_list),
        "retmode": "json"
    }
    summary_qs = urllib.parse.urlencode(summary_params)
    
    results = []
    try:
        with urllib.request.urlopen(f"{summary_url}?{summary_qs}") as response:
            summary_data = json.loads(response.read().decode("utf-8"))
            
        result_dict = summary_data.get("result", {})
        for uid in id_list:
            item = result_dict.get(uid)
            if not item:
                continue
            
            # Use caption as accession
            accession = item.get("caption", uid)
            title = item.get("title", "Unknown")
            organism = item.get("organism", "Unknown")
            length = item.get("slen", None)
            
            results.append(GenomeSearchResult(
                id=uid,
                accession=accession,
                title=title,
                organism=organism,
                source="ncbi",
                length=int(length) if length else None
            ))
    except Exception:
        pass
        
    return results


def search_ensembl_genomes(query: str) -> list[GenomeSearchResult]:
    if not query.strip():
        return []
        
    # Ensembl doesn't have a direct "search for genome" endpoint that matches NCBI.
    # We can use the lookup/symbol API for finding specific genes, or just use 
    # info/species to match species names, then provide their primary assembly.
    # We'll use lookup if it's an ID, else try info/species matching.
    
    query_lower = query.lower().strip()
    
    # Fast path for explicit Ensembl ID (like ENSG...)
    if query_lower.startswith("ens"):
        try:
            url = f"https://rest.ensembl.org/lookup/id/{query_lower}?expand=0"
            req = urllib.request.Request(url, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode("utf-8"))
                
            return [GenomeSearchResult(
                id=data.get("id"),
                accession=data.get("id"),
                title=f"{data.get('object_type', 'Sequence')} {data.get('display_name', '')}",
                organism=data.get("species", "Unknown"),
                source="ensembl",
                length=(data.get("end", 0) - data.get("start", 0) + 1) if "start" in data and "end" in data else None
            )]
        except Exception:
            # Maybe not an ID or not found
            pass

    # If it's a species search
    try:
        url = "https://rest.ensembl.org/info/species"
        req = urllib.request.Request(url, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode("utf-8"))
            
        species_list = data.get("species", [])
        results = []
        for sp in species_list:
            name = sp.get("display_name", "").lower()
            alias = sp.get("name", "").lower()
            if query_lower in name or query_lower in alias:
                # Provide the primary assembly of the species
                assembly = sp.get("assembly", "Unknown")
                sp_name = sp.get("display_name", "Unknown")
                results.append(GenomeSearchResult(
                    id=sp.get("name"), # Use the ensembl short name as ID
                    accession=sp.get("name"), # We'll need the species name to fetch
                    title=f"{sp_name} (Assembly: {assembly})",
                    organism=sp_name,
                    source="ensembl",
                    length=None
                ))
                if len(results) >= 10:
                    break
        return results
    except Exception:
        pass
        
    return []
