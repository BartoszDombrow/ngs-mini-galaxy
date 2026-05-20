# Project Plan – NGS Mini Galaxy

## 1. Temat projektu

Webowa aplikacja do uruchamiania podstawowego pipeline’u analizy danych NGS z plików FASTQ, inspirowana platformą Galaxy.

---

## 2. Cel projektu

Celem projektu jest stworzenie aplikacji umożliwiającej:

- zarządzanie użytkownikami i ich projektami,
- wgrywanie danych sekwencjonowania (FASTQ),
- uruchamianie pipeline’u bioinformatycznego,
- monitorowanie statusu analizy,
- przeglądanie i pobieranie wyników.

---

## 3. Użytkownicy systemu

- użytkownik końcowy (student / bioinformatyk)
- brak ról (na MVP wszyscy równi)

---

## 4. Zakres funkcjonalny

### 4.1 Autoryzacja

- rejestracja użytkownika
- logowanie
- JWT authentication

### 4.2 Projekty

- tworzenie projektu
- lista projektów użytkownika
- szczegóły projektu

### 4.3 Upload danych

- upload FASTQ / FASTQ.GZ
- obsługa paired-end i single-end
- zapis plików na dysku

### 4.4 Pipeline analityczny

- konfiguracja kroków:
    - FastQC
    - Trimmomatic (opcjonalnie)
    - MultiQC
    - BWA
    - samtools
    - bcftools
- uruchamianie analizy

### 4.5 Job management

- status joba:
    - queued
    - running
    - completed
    - failed
- lista jobów w projekcie
- szczegóły joba

### 4.6 Logi i wyniki

- logi dla każdego kroku
- raporty:
    - FastQC
    - MultiQC
- pliki wynikowe:
    - trimmed FASTQ
    - BAM / BAI
    - VCF

---

## 5. Architektura systemu

### Frontend

- Next.js (App Router)
- TypeScript
- Tailwind CSS

### Backend

- FastAPI
- SQLite
- JWT auth

### Pipeline

- Python subprocess
- narzędzia bioinformatyczne:
    - FastQC
    - MultiQC
    - Trimmomatic
    - BWA
    - samtools
    - bcftools

### Storage

- pliki na dysku:
    - uploads/
    - jobs/
    - results/

---

## 6. Struktura projektu

Jak widac

---

## 7. MVP (Minimum Viable Product)

### MVP v1

- rejestracja i logowanie
- tworzenie projektów
- upload FASTQ
- uruchamianie joba (fake runner)
- status joba

### MVP v2

- logi joba
- MultiQC
- lista wyników

### MVP v3

- pełny pipeline:
    - BWA
    - samtools
    - bcftools

---

## 8. Podział pracy

### Osoba 1 (Frontend)

- UI (Next.js)
- auth pages
- dashboard
- projekty
- job details
- integracja z API

### Osoba 2 (Backend)

- FastAPI
- modele danych
- auth (JWT)
- upload plików
- job runner
- pipeline

### Wspólnie

- projekt API
- struktura danych
- testy
- demo

---

## 9. Plan pracy (Sprinty)

### Sprint 1 (setup)

- repozytorium
- struktura projektu
- frontend + backend skeleton

### Sprint 2 (auth)

- rejestracja
- logowanie
- JWT

### Sprint 3 (projekty)

- CRUD projektów
- dashboard

### Sprint 4 (upload)

- upload FASTQ
- zapis plików

### Sprint 5 (jobs)

- model joba
- statusy
- fake runner

### Sprint 6 (pipeline)

- FastQC
- MultiQC

### Sprint 7 (rozszerzenie)

- BWA
- samtools
- bcftools

---

## 10. Ryzyka

- duże pliki FASTQ
- długi czas działania pipeline’u
- konfiguracja narzędzi bioinformatycznych
- zależności systemowe (Java, BWA, bcftools)
- brak referencji genomowych

---

## 11. Dane testowe

- małe pliki FASTQ
- mała referencja
- szybki pipeline demo

---

## 12. Definicja ukończenia projektu

Projekt uznaje się za ukończony, gdy:

- użytkownik może się zalogować
- może stworzyć projekt
- może wrzucić FASTQ
- może uruchomić analizę
- widzi status
- widzi wyniki (raporty + pliki)

---
