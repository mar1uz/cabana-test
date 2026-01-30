// Flatpickr initialization script
const ratePerNight = 150;
const priceSummary = document.getElementById('priceSummary');

function formatDate(date) {
    if (!date || isNaN(date)) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function parseDate(dateStr) {
    const [day, month, year] = dateStr.split('/');
    return new Date(year, month - 1, day);
}

function getDatesInRange(startDate, endDate) {
    const dates = [];
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
}

async function initializeDatePicker() {
    try {
        const res = await fetch('/api/booked-dates');
        const bookedRanges = await res.json();

        const disabledDates = [];
        bookedRanges.forEach(range => {
            const start = parseDate(range.checkIn);
            const end = parseDate(range.checkOut);
            const datesInRange = getDatesInRange(start, end);
            disabledDates.push(...datesInRange);
        });

        flatpickr("#dateRange", {
            mode: "range",
            dateFormat: "d/m/Y",
            minDate: "today",
            disable: disabledDates,
            onChange: function (selectedDates, dateStr, instance) {
                if (selectedDates.length === 2) {
                    const checkIn = selectedDates[0];
                    const checkOut = selectedDates[1];

                    window.selectedDates = {
                        checkIn: formatDate(checkIn),
                        checkOut: formatDate(checkOut)
                    };

                    const diffDays = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
                    const total = diffDays * ratePerNight;
                    priceSummary.innerHTML = `<strong>Total: $${total}</strong> <br><small>(${diffDays} nights at $${ratePerNight}/night)</small>`;
                    priceSummary.style.background = "#e8f6f3";
                    priceSummary.style.color = "var(--primary)";
                } else {
                    priceSummary.innerHTML = "Select check-in and check-out dates";
                    priceSummary.style.background = "#f8f9fa";
                }
            }
        });
    } catch (err) {
        console.error('Error loading booked dates:', err);
        flatpickr("#dateRange", {
            mode: "range",
            dateFormat: "d/m/Y",
            minDate: "today"
        });
    }
}

initializeDatePicker();
