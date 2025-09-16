document.getElementById("calcBtn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // First try to access the iframe directly
  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id, allFrames: true },
      func: findAndCalculateFromIframe
    },
    (injectionResults) => {
      const resultDiv = document.getElementById("result");
      const coursesDiv = document.getElementById("courses");
      const exportBtn = document.getElementById("exportBtn");

      // reset UI
      resultDiv.textContent = "";
      coursesDiv.innerHTML = "";
      if (exportBtn) exportBtn.style.display = "none";

      // Find the first successful result
      const validResults = injectionResults
        .map(r => r.result)
        .filter(val => val !== null && val !== undefined);

      if (validResults.length > 0) {
        const result = validResults.find(r => r.gpa) || validResults[0];

        if (result.error) {
          resultDiv.textContent = `Error: ${result.error}`;
          if (result.debug) {
            coursesDiv.innerHTML = `<div style="font-size: 10px; max-height: 300px; overflow-y: auto;">${result.debug}</div>`;
          }
        } else if (result.gpa) {
          const { gpa, courses } = result;
          window.gpaCourses = courses; // save full courses globally for export

          resultDiv.textContent = `Your weighted GPA: ${gpa.toFixed(2)}`;

          let html = "<table><tr><th>Course</th><th>Grade</th><th>Credits</th></tr>";
          courses.forEach(c => {
            html += `<tr><td title="${c.courseName}">${c.courseName.substring(0, 30)}${c.courseName.length > 30 ? '...' : ''}</td><td>${c.grade}</td><td>${c.credits}</td></tr>`;
          });
          html += "</table>";
          coursesDiv.innerHTML = html;

          // show export button
          if (exportBtn) exportBtn.style.display = "inline-block";
        } else {
          resultDiv.textContent = "Found frames but no transcript data";
          coursesDiv.innerHTML = result.debug || "";
        }
      } else {
        resultDiv.textContent = "Could not access transcript data. Try refreshing the page.";
        coursesDiv.innerHTML = "";
      }
    }
  );
});

function findAndCalculateFromIframe() {
  try {
    const rows = document.querySelectorAll("table tr");
    let rawCourses = [];

    rows.forEach(row => {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 6) {
        const courseName = cells[1].innerText.trim();
        const gradeText = cells[3].innerText.trim().replace(",", ".");
        const creditText = cells[5].innerText.trim().replace(",", ".");
        const grade = parseFloat(gradeText);
        const credits = parseFloat(creditText);

        // only keep if grade + credits are valid numbers
        if (!isNaN(grade) && !isNaN(credits) && credits > 0) {
          rawCourses.push({ courseName, grade, credits });
        }
      }
    });

    // Deduplicate (prefer longer name if duplicate found)
    let courses = [];
    rawCourses.forEach(c => {
      const duplicate = courses.find(existing =>
        existing.courseName.includes(c.courseName) ||
        c.courseName.includes(existing.courseName)
      );
      if (duplicate) {
        if (c.courseName.length > duplicate.courseName.length) {
          duplicate.courseName = c.courseName;
          duplicate.grade = c.grade;
          duplicate.credits = c.credits;
        }
      } else {
        courses.push(c);
      }
    });

    if (courses.length === 0) {
      return { error: "No valid courses found in this frame" };
    }

    // GPA calculation
    let totalWeighted = 0, totalCredits = 0;
    courses.forEach(c => {
      totalWeighted += c.grade * c.credits;
      totalCredits += c.credits;
    });
    let gpa = totalCredits > 0 ? totalWeighted / totalCredits : null;

    if (gpa === null) {
      return { error: "Could not calculate GPA" };
    }

    return { gpa, courses };
  } catch (error) {
    return {
      error: `Iframe script error: ${error.message}`,
      debug: error.stack
    };
  }
}

// CSV Exporter
document.getElementById("exportBtn").addEventListener("click", () => {
  const courses = window.gpaCourses || [];
  if (!courses.length) return;

  let csv = [];
  csv.push(["Course", "Grade", "Credits"].join(",")); // header row

  courses.forEach(c => {
    csv.push([c.courseName, c.grade, c.credits].map(val => `"${String(val).replace(/"/g, '""')}"`).join(","));
  });

  const blob = new Blob([csv.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "tu-berlin-gpa.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

